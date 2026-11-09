use std::time::Duration;

use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate, TimeZone, Weekday};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db;

const SETTING_REMINDERS: &str = "reminders_enabled";
const SETTING_DND: &str = "do_not_disturb";
const SETTING_WAKE_HOUR: &str = "reminder_wake_hour";
const SETTING_ACTIVE_GOAL: &str = "active_goal_id";
const SETTING_INACTIVITY: &str = "reminder_inactivity";
const SETTING_PASSIVE: &str = "reminder_passive";
const SETTING_WEEKLY: &str = "reminder_weekly";

const SENT_INACTIVITY: &str = "reminder_sent_inactivity";
const SENT_PASSIVE: &str = "reminder_sent_passive";
const SENT_WEEKLY: &str = "reminder_sent_weekly";

const PASSIVE_WORDS: &[&str] = &[
    "watch", "watched", "watching", "read", "reading", "listen", "listened", "listening",
    "view", "viewed", "viewing", "course", "video", "tutorial", "podcast", "book",
];

fn read_setting(connection: &Connection, key: &str) -> Option<String> {
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
}

fn category_enabled(connection: &Connection, key: &str) -> bool {
    read_setting(connection, key).as_deref() != Some("false")
}

fn sent_today(connection: &Connection, key: &str, today: &str) -> bool {
    read_setting(connection, key).as_deref() == Some(today)
}

fn mark_sent(app: &AppHandle, key: &str, today: &str) {
    let Some(path) = db::database_path(app) else {
        return;
    };
    let Ok(connection) = Connection::open(&path) else {
        return;
    };
    let _ = connection.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, today],
    );
}

fn active_goal(connection: &Connection) -> Option<i64> {
    if let Some(configured) = read_setting(connection, SETTING_ACTIVE_GOAL)
        .and_then(|value| value.parse::<i64>().ok())
    {
        let exists: Option<i64> = connection
            .query_row(
                "SELECT id FROM goals WHERE id = ?1 AND archived_at IS NULL",
                [configured],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten();
        if let Some(id) = exists {
            return Some(id);
        }
    }
    connection
        .query_row(
            "SELECT id FROM goals WHERE archived_at IS NULL ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .or_else(|| {
            connection
                .query_row("SELECT id FROM goals ORDER BY id DESC LIMIT 1", [], |row| {
                    row.get(0)
                })
                .optional()
                .ok()
                .flatten()
        })
}

fn last_entry_date(connection: &Connection, goal_id: i64) -> Option<NaiveDate> {
    let value: Option<String> = connection
        .query_row(
            "SELECT MAX(date) FROM entries WHERE goal_id = ?1",
            [goal_id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    value.and_then(|key| NaiveDate::parse_from_str(&key, "%Y-%m-%d").ok())
}

fn is_passive_line(line: &str) -> bool {
    line.split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .any(|word| PASSIVE_WORDS.contains(&word.to_ascii_lowercase().as_str()))
}

/// Counts consecutive passive-only days ending at the last logged day.
fn passive_only_streak(connection: &Connection, goal_id: i64, last: NaiveDate) -> i64 {
    let from = last - ChronoDuration::days(7);
    let Ok(mut statement) = connection.prepare(
        "SELECT date, action, learned, text, source
         FROM entries
         WHERE goal_id = ?1 AND date >= ?2 AND date <= ?3",
    ) else {
        return 0;
    };
    let Ok(rows) = statement.query_map(
        [
            goal_id.to_string(),
            from.format("%Y-%m-%d").to_string(),
            last.format("%Y-%m-%d").to_string(),
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        },
    ) else {
        return 0;
    };

    use std::collections::HashMap;
    let mut by_date: HashMap<String, (i64, i64)> = HashMap::new();
    for row in rows.flatten() {
        let haystack = format!(
            "{} {} {} {}",
            row.1.unwrap_or_default(),
            row.2.unwrap_or_default(),
            row.3.unwrap_or_default(),
            row.4.unwrap_or_default()
        );
        let entry = by_date.entry(row.0).or_insert((0, 0));
        entry.0 += 1;
        if is_passive_line(&haystack) {
            entry.1 += 1;
        }
    }

    let mut cursor = last;
    let mut streak = 0;
    for _ in 0..7 {
        let key = cursor.format("%Y-%m-%d").to_string();
        match by_date.get(&key) {
            Some((total, passive)) if *total > 0 && total == passive => streak += 1,
            _ => break,
        }
        cursor -= ChronoDuration::days(1);
    }
    streak
}

fn weekly_review_missing(connection: &Connection, goal_id: i64, today: NaiveDate) -> bool {
    let week_start = today - ChronoDuration::days(today.weekday().num_days_from_monday() as i64);
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM weekly_reviews WHERE goal_id = ?1 AND week_start = ?2",
            [goal_id.to_string(), week_start.format("%Y-%m-%d").to_string()],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count == 0
}

fn show(app: &AppHandle, title: &str, body: &str) {
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        eprintln!("Striker could not show a reminder: {error}");
    }
}

fn run_checks(app: &AppHandle) -> Result<(), String> {
    let Some(path) = db::database_path(app) else {
        return Ok(());
    };
    if !path.exists() {
        return Ok(());
    }
    let connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;

    if read_setting(&connection, SETTING_REMINDERS).as_deref() == Some("false") {
        return Ok(());
    }
    if read_setting(&connection, SETTING_DND).as_deref() == Some("true") {
        return Ok(());
    }
    let Some(goal_id) = active_goal(&connection) else {
        return Ok(());
    };

    let today = Local::now().date_naive();
    let today_key = today.format("%Y-%m-%d").to_string();

    // Only one nudge goes out per day, in priority order: weekly, passive, inactivity.
    if today.weekday() == Weekday::Sun
        && category_enabled(&connection, SETTING_WEEKLY)
        && !sent_today(&connection, SENT_WEEKLY, &today_key)
        && weekly_review_missing(&connection, goal_id, today)
    {
        show(
            app,
            "Weekly review time",
            "Capture what worked this week and pick one focus for the next one.",
        );
        mark_sent(app, SENT_WEEKLY, &today_key);
        return Ok(());
    }

    let Some(last) = last_entry_date(&connection, goal_id) else {
        return Ok(());
    };
    let days_since = (today - last).num_days();

    if days_since <= 1
        && category_enabled(&connection, SETTING_PASSIVE)
        && !sent_today(&connection, SENT_PASSIVE, &today_key)
    {
        let passive_days = passive_only_streak(&connection, goal_id, last);
        if passive_days >= 3 {
            show(
                app,
                "Turn input into practice",
                &format!(
                    "{passive_days} days of only watching and reading. Pick one small hands-on exercise today and log the evidence."
                ),
            );
            mark_sent(app, SENT_PASSIVE, &today_key);
            return Ok(());
        }
    }

    if days_since >= 2
        && category_enabled(&connection, SETTING_INACTIVITY)
        && !sent_today(&connection, SENT_INACTIVITY, &today_key)
    {
        show(
            app,
            "A small session keeps it going",
            &format!("No learning logged for {days_since} days. Ten focused minutes is enough to restart."),
        );
        mark_sent(app, SENT_INACTIVITY, &today_key);
    }

    Ok(())
}

fn wake_hour(app: &AppHandle) -> u32 {
    let Some(path) = db::database_path(app) else {
        return 9;
    };
    let Ok(connection) = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return 9;
    };
    read_setting(&connection, SETTING_WAKE_HOUR)
        .and_then(|value| value.parse::<u32>().ok())
        .map(|hour| hour.min(23))
        .unwrap_or(9)
}

fn delay_until(hour: u32) -> Duration {
    let now = Local::now();
    let date = now.date_naive();
    let build = |day: NaiveDate| {
        Local
            .with_ymd_and_hms(day.year(), day.month(), day.day(), hour, 0, 0)
            .single()
    };
    let target = match build(date) {
        Some(moment) if moment > now => Some(moment),
        _ => date.succ_opt().and_then(build),
    };
    let Some(target) = target else {
        return Duration::from_secs(3600);
    };
    (target - now)
        .to_std()
        .unwrap_or(Duration::from_secs(3600))
        .max(Duration::from_secs(60))
}

/// One sleep loop for the whole app. Nothing here touches the WebView.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Give the SQL plugin a moment to apply migrations before reading.
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let hour = wake_hour(&app);
            tokio::time::sleep(delay_until(hour)).await;
            if let Err(error) = run_checks(&app) {
                eprintln!("Striker reminder check failed: {error}");
            }
        }
    });
}
