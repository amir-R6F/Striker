# Striker

A floating desktop widget for tracking daily learning — built for Windows 10/11 with
Tauri 2, React, TypeScript, Vite, Tailwind CSS and SQLite.

Striker sits above other windows in the bottom-right of your screen, with no
taskbar button and no window chrome. Log a session in seconds, see where your time
and confidence are going by skill, track milestones, and close each ISO week with
a short review.

## Features

### Widget and system integration

- **Floating widget** — 420 × 640, borderless, transparent, rounded corners,
  always on top, no taskbar icon, positioned bottom-right on the primary monitor.
- **Tray menu** — Show / Hide, Quick Log, Quit. Left-click toggles the widget;
  right-click opens the menu.
- **Global hotkey** — `Ctrl + Shift + S` toggles the widget. When it appears, the
  learned textarea is focused.
- **Optional auto-start** and a configurable idle auto-hide (5 minutes by default).
  No timers run while the widget is hidden.

### Structured logging

Each entry can capture:

- **Action** — what you did
- **Learned** — what you learned
- **Difficulty** — what was hard or still open
- **Source** — an http(s) link
- **Evidence** — a local file path or URL
- **Minutes** and **confidence** (1–5)
- **Multiple skills** from your editable list

Quick-log templates fill the structure in one click:

| Template | What it fills |
| --- | --- |
| Practice session | Action, 45 min default, opens details |
| Problem & solution | Action, open-question scaffold, opens details |
| Project idea | Action, “Idea:” starter in the learned field |
| Weekly review | Action, 30 min default, opens details |

Templates reset the fields they own (action, learned, difficulty, minutes) and keep
your selected skills. `Ctrl + Enter` saves without leaving the textarea.

### Search

A dedicated Search tab looks across action, learned, difficulty, legacy notes,
source and evidence. Filters cover skill node (including all descendants), date
range, minimum confidence and goal. Matches are highlighted, and source/evidence
links open in the Windows shell.

### Skill roadmap

- **Multiple trees** are supported: one linked to your goal plus any number of
  custom roadmaps. The active tree is used by the Log tab’s multi-select and can
  be switched from the Skills tab.
- **Tree view** uses React Flow for pan, zoom, expand/collapse and click-to-edit.
  Nodes show rolled-up minutes, linked-entry count and an estimated-hours
  progress bar.
- **Roadmap view** is a depth-grouped linear list with sibling drag-and-drop
  reordering. A windowed list keeps the DOM small for large trees (500+ nodes).
- **Node details** support title, description, tags, estimated hours, resources,
  parent changes (with cycle prevention), child creation and deletion. Deleting a
  node removes its descendants and their entry links after confirmation.
- **Entry links** can be managed from a node’s detail panel; progress on parent
  nodes includes all descendants. The Search and Dashboard views aggregate the
  same node links.
- **JSON import/export** uses the documented schema v1:
  - Export writes `<tree>-roadmap.json` into Downloads with a separate `meta`
    object for counts, total minutes and entries.
  - Import accepts a file or pasted JSON and validates schema version, unique ids,
    parent references, cycles and `children` consistency.
  - Modes are **Merge** (update matching ids, add new), **Replace** (clear the
    current tree after confirmation) and **New tree** (append as a separate tree).
  - **Copy AI prompt** copies a ready-to-use schema and example prompt so an AI can
    return a valid roadmap JSON.

The old two-level `skills` data is migrated into a default roadmap during the
schema upgrade. Existing entry links are copied to `entry_skill_nodes`.

### Milestones

Create, edit and delete milestones with a title, description, target date and
optional target hours (10 h prefilled for new milestones). Link any of your recent
entries with checkboxes. The dashboard shows each milestone with its progress bar,
logged time, entry count and days until (or past) the target date. Progress is
linked minutes ÷ target hours; if you clear the target hours the row shows time
and linked entries without a bar.

### Striker Score

A composite 0–100 score shown on the dashboard with a full breakdown and an
explanation tooltip:

- **Streak — 30%** — current consecutive days, full marks at 30
- **Weekly time — 30%** — minutes this week ÷ weekly goal
- **Skill diversity — 20%** — distinct skill nodes used in the last 30 days, full marks at 5
- **Milestones — 20%** — completed ÷ total milestones

### Evidence portfolio

Attach images, GIFs, PDFs or links while logging. Selected files are copied into
Striker's app-data `evidence` folder; the database stores the local path. The
dashboard gallery can show the whole goal or filter to a milestone, with lazy
image previews. Existing single-path evidence is migrated into the portfolio.

### Integrations

- **Pomodoro focus timer** — in the Log tab, next to the form. Focus/break
  lengths are configurable (25/5 by default). Completed focus minutes are added to
  the most recent entry logged today; **Log** records a partial session. The timer
  pauses whenever the widget is hidden and never runs in the background.
- **GitHub links** — attach a commit, issue, pull request, file, repository or
  gist URL from **Log → Add details → Integrations**. The URL is stored as a link
  evidence item and opens in your browser.
- **ArtStation links** — attach an ArtStation project URL the same way.
- **Blender projects** — attach an absolute path to a local `.blend` file. The
  file is referenced, not copied, so it stays wherever your project lives.
- **Calendar export** — **Review → Weekly review → Export plan to calendar**
  writes an all-day `.ics` event for the following ISO week into Downloads. It
  contains the goal, summary, next-week plan and open questions.

### Gamification

- XP: each entry earns `round(minutes / 10 + confidence)`, totalled on the dashboard.
- Badges for 7/30/100-day streaks, 1/5 completed milestones and 10/50/100 hours.
- Optional 7-day challenge: log at least one entry per day for seven days, with
  progress dots and a restart control.
- Both XP/badges and the challenge have toggles in Settings; everything is computed
  on demand from local data.

### Flashcards and spaced repetition

- Any entry can become a card: **Make card** in Search opens a prefilled draft,
  and Review → Cards suggests entries that have a “learned” note but no card yet.
- Cards live in SQLite with front, back, an optional entry link, due date, interval,
  ease, repetitions and lapses. Cards can be added manually with both sides.
- A small SM-2 scheduler drives the daily queue. Reveal the back, then grade
  **Again / Hard / Good / Easy**; each button previews the next interval.
- Again resets the card to tomorrow and counts a lapse. Passing grades move a card
  from 1 day to 6 days and then grow it by the card’s ease (clamped 1.3–5.0).

### Smart reminders

- At most one gentle tray notification per day, and only while the widget is
  visible.
- After two days without an entry, a quiet nudge to log ten focused minutes.
- After three consecutive days of only watching/reading, suggests one hands-on
  exercise instead of more input.
- On Sunday, prompts the weekly review when this week has no saved review.
- Priority is weekly review → passive streak → inactivity. **Do not disturb**
  silences everything; both toggles live in Settings → Reminders.

### Optional AI weekly summary

- **Summarize week** in Review → Weekly review sends only the selected week's
  entries (action, learned, hard/open notes, minutes and skills) to a provider you
  configure. It returns key learnings, suggestions and open questions, which can
  be applied to the review form.
- **Ollama** is the default (`http://localhost:11434`, model `llama3.1`). Any
  OpenAI-compatible endpoint works (`/chat/completions`, model `gpt-4o-mini` by
  default) with an API key.
- Requests run only when the button is pressed, time out after 60 seconds and are
  capped at roughly 12,000 characters of prompt. There is no background or
  automatic summarization.
- The API key is stored encrypted (AES-256-GCM with a per-install device key).

### Optional encrypted sync

- Back up or restore through a **local folder** (absolute path) or a **WebDAV**
  folder URL with optional Basic authentication. Nothing syncs automatically.
- Backups are end-to-end encrypted with PBKDF2-SHA256 (310,000 iterations) and
  AES-256-GCM, keyed by a passphrase you enter. The passphrase is never stored.
- The encrypted envelope includes all goals, entries, reviews, cards, evidence
  paths and settings — including encrypted secrets — so a restore on another
  install can keep AI/sync configuration working.
- Restore validates the envelope, asks for confirmation, then **replaces** local
  goals, entries, links, reviews and cards. Evidence files themselves are not in
  the backup, so paths copied from another PC will not exist locally.
- Plain JSON/CSV exports remain secret-free.

### Encryption at rest

- AI keys and the WebDAV password are encrypted with AES-256-GCM using a random
  per-install device key stored in settings. This keeps plaintext secrets out of
  the database file and plain backups; it is not protection against someone who
  can read the entire app-data folder.
- **SQLCipher is not enabled.** The stock `tauri-plugin-sql` used by Tauri 2 opens
  SQLite without SQLCipher, and its `Database.load` API has no passphrase option.
  Encrypting the live `striker.db` requires building a SQLCipher-enabled SQL plugin
  (or patching the Rust crate); Settings → Encryption states this limitation
  instead of offering a toggle that would not work. Use the encrypted backup for
  at-rest protection in this build.

### Reports

Settings → Reports generates a monthly or quarterly learning report for the active
goal, as Markdown or PDF. The template covers total time, entry count, skills
practiced, completed milestones, top learnings, weekly reviews and an evidence
gallery. Full-data Markdown and PDF exports include all goals, entries, skills,
milestones, reviews and evidence.

### Dashboard

- Total time, current streak and longest streak
- Striker Score breakdown
- Weekly target progress
- XP, badges and optional 7-day challenge
- Milestone progress list (completion is marked from the milestone editor)
- Goal/milestone evidence gallery
- 90-day calendar heatmap
- Lazy-loaded Recharts charts:
  - daily minutes (30 days)
  - stacked time by skill node (30 days, top six nodes + grouped remainder)
  - daily confidence (30 days)
  - weekly confidence per skill node (8 weeks, top four nodes)

### Weekly review and export

- Review → Weekly pre-fills the summary, top skills, open questions and a next-week
  plan from this week’s entries and the six weeks before it. The draft is applied
  automatically only when the week has no saved review; **Pre-fill from stats**
  can replace it deliberately.
- Summary, next-week plan and open questions stored per ISO week.
- **Export plan to calendar** writes an all-day `.ics` event for the following
  week (`striker-week-YYYY-MM-DD.ics`) into Downloads.
- **Summarize week** optionally calls the configured AI endpoint and can apply
  its key learnings, suggestions and open questions to the form.
- JSON export includes goals, entries, skill trees and nodes, entry links,
  milestones, milestone links, evidence, weekly reviews, flashcards and
  non-secret settings (`schema_version: 5`). Schema-4 backups still restore by
  converting their legacy `skills` rows into a roadmap.
- CSV export has one row per entry with goal and skill names resolved.
- Markdown/PDF reports and full exports are written to Downloads on demand.

## Tech stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 (Windows / WebView2) |
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 (CSS-first theme, class-based dark mode) |
| State | Zustand |
| Charts | Recharts (lazy-loaded chunk) |
| Roadmap | `@xyflow/react` (lazy-loaded chunk) |
| PDF | jsPDF (lazy-loaded chunk) |
| Storage | SQLite via `tauri-plugin-sql` |
| Network | `tauri-plugin-http` (AI requests, WebDAV) |
| System | `tauri-plugin-global-shortcut`, `tauri-plugin-autostart`, `tauri-plugin-notification` |

## Requirements

- **Windows 10 or Windows 11** (x64)
- **Node.js 20.19+** (22 LTS or newer recommended)
- **Rust** (stable) installed through [rustup](https://rustup.rs/), MSVC toolchain:
  ```powershell
  rustup default stable-x86_64-pc-windows-msvc
  ```
- **Visual Studio Build Tools 2022** with the **Desktop development with C++**
  workload and a Windows 10/11 SDK (needed for the Rust linker and the bundled
  SQLite build).
- **WebView2 Runtime** — preinstalled on Windows 11 and most Windows 10 machines.
  The installer can bootstrap it if it is missing.
- Internet access on the first build (Cargo crates and the WebView2 bootstrapper).

## Development

```powershell
npm install
npm run tauri:dev
```

`tauri:dev` starts Vite on `http://localhost:1420` and launches the widget. The
first Rust compile takes several minutes; later builds are incremental.

Useful scripts:

```powershell
npm run dev        # Vite only (browser preview, no SQLite/Tauri APIs)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production frontend build
npm run tauri:build
```

## Building the Windows installer

```powershell
npm run tauri:build
```

Outputs:

- `src-tauri/target/release/striker.exe` — standalone executable
- `src-tauri/target/release/bundle/nsis/Striker_0.1.0_x64-setup.exe` — per-user
  NSIS installer

The bundle is configured for `nsis` with `installMode: currentUser`, so no admin
rights are required. The installer is unsigned; Windows SmartScreen may warn on
first run.

## Using Striker

1. **First run** — create a goal: title, description, start date, weekly hours and
   success criteria. Striker tracks one active goal.
2. **Log** — pick a template or fill Action / Learned, tag skill nodes, and
   optionally open details for difficulty, source, evidence, minutes and
   confidence. Use **Attach file** for images/PDFs or paste a link/path into
   Evidence.
3. **Search** — find anything you have logged and filter by skill, date range,
   confidence or goal.
4. **Skills** — select or create a roadmap, switch between Tree and Roadmap views,
   and click a node to edit it, add children, move it or link entries. Import and
   export roadmaps under the tree controls.
5. **Dashboard** — check your Striker Score, XP/badges/challenge, streaks,
   milestones, evidence gallery and skill charts. Click a milestone to edit it,
   mark it complete, or filter the gallery to it; use **Add** to create one.
6. **Review** — navigate weeks and save your summary, plan and open questions.
7. **Settings** — theme, auto-start, idle hiding, gamification, Pomodoro lengths,
   AI provider/key, encrypted sync, encryption status, report generation and data
   export.

### Hotkey notes

`Ctrl + Shift + S` toggles the widget. If another application already owns the
shortcut, change `HOTKEY` in `src-tauri/src/lib.rs` and the hint text in
`src/components/tabs/SettingsTab.tsx`.

## Data

SQLite lives in the Tauri app config directory:

```
%APPDATA%\com.striker.desktop\striker.db
```

Schema (migrations in `src-tauri/src/lib.rs`):

| Table | Columns |
| --- | --- |
| `goals` | `id`, `title`, `description`, `start_date`, `weekly_hours_goal`, `success_criteria`, `created_at` |
| `entries` | `id`, `goal_id`, `date`, `text`, `action`, `learned`, `difficulty`, `source`, `evidence`, `minutes`, `confidence`, `skill_tag`, `created_at` |
| `skill_trees` | `id`, `goal_id`, `title`, `description`, `source`, `schema_version`, `created_at`, `updated_at` |
| `skill_nodes` | `id`, `tree_id`, `external_id`, `parent_id`, `title`, `description`, `order_index`, `tags`, `estimated_hours`, `resources_json`, `created_at`, `updated_at` |
| `entry_skill_nodes` | `entry_id`, `node_id` |
| `skills` | Legacy two-level skills (`id`, `name`, `parent_id`, `created_at`) retained for migration and old backups |
| `entry_skills` | Legacy entry links (`entry_id`, `skill_id`) retained for old backups |
| `milestones` | `id`, `goal_id`, `title`, `description`, `target_date`, `target_minutes`, `completed_at`, `created_at` |
| `milestone_entries` | `milestone_id`, `entry_id` |
| `entry_evidence` | `id`, `entry_id`, `kind`, `path`, `original_name`, `created_at` |
| `weekly_reviews` | `id`, `goal_id`, `week_start`, `summary`, `next_week_plan`, `open_questions` |
| `flashcards` | `id`, `goal_id`, `entry_id`, `front`, `back`, `due_date`, `interval_days`, `ease`, `repetitions`, `lapses`, `last_reviewed_at`, `created_at` |
| `settings` | `key`, `value` |

Attached files live under the Tauri app-data folder, in `evidence/`. Paths are
stored in `entry_evidence`; the legacy `entries.evidence` column mirrors the first
attachment for search and CSV compatibility. Existing evidence paths are migrated
into `entry_evidence` by migration 25.

`entries.text` and `entries.skill_tag` are legacy columns from the first version.
New entries write `text` as a fallback (learned, else action) and `skill_tag` as the
first selected node title; both remain searchable. Existing single skill tags and
`entry_skills` links are migrated into `skill_nodes` and `entry_skill_nodes` by
migrations 30–39. New entries write only `entry_skill_nodes`.

Indexes used by the dashboard, search and roadmap:

```
idx_entries_date, idx_entries_skill_tag, idx_entries_goal_id,
idx_entries_goal_date, idx_entry_skills_skill,
idx_skill_nodes_tree, idx_skill_nodes_parent, idx_skill_nodes_external,
idx_entry_skill_nodes_node,
idx_milestones_goal, idx_milestone_entries_entry,
idx_entry_evidence_entry, idx_flashcards_goal_due, idx_flashcards_entry
```

Dates are local `YYYY-MM-DD` strings. Reviews are upserted on the unique
`(goal_id, week_start)` pair. To start over, quit Striker and delete `striker.db`;
migrations recreate and seed the schema on the next launch.

## Export

Settings → Data writes into your **Downloads** folder:

- **Export JSON backup** — everything except secrets
  (`striker-backup-YYYY-MM-DD.json`, schema 5).
- **Export entries CSV** — columns: goal, date, action, learned, difficulty,
  source, evidence, minutes, confidence, skills, created_at
  (`striker-entries-YYYY-MM-DD.csv`, UTF-8 BOM + CRLF for Excel).
- **Export full Markdown / PDF** — all goals, entries, skills, milestones,
  evidence, learnings and reviews (`striker-full-export-YYYY-MM-DD.*`).

Settings → Reports writes a monthly or quarterly report for the active goal:

- **Markdown** — `striker-monthly-YYYY-MM.md` or `striker-quarterly-YYYY-MM.md`
- **PDF** — the same content rendered to A4 with image thumbnails where the
  attached evidence is PNG/JPEG (`striker-monthly-YYYY-MM.pdf` / quarterly).

The report template lives in `src/lib/report.ts` (`REPORT_TEMPLATE`) and includes
snapshot totals, skills practiced, completed milestones, an evidence gallery, top
learnings and the period's weekly reviews. PDF generation is a lazy jsPDF import;
reports are only built when a button is pressed.

Existing files get a `-1`, `-2`, … suffix. The full path is shown in the toast and
in Settings.

## Performance design

- A single idle timeout exists only while the window is visible; hiding the window
  clears it and showing re-arms it.
- Rust emits `striker://visibility` on every show/hide; the UI pauses work when
  hidden.
- Recharts is a separate lazy chunk, mounted only when the Dashboard tab is active
  **and** the window is visible. Animations are disabled.
- React Flow is a separate lazy chunk, loaded only when the Skills tab is active,
  visible and showing Tree view. Roadmap view uses a windowed list above 500 nodes.
- Tree nodes and stats are fetched only when the tab is opened; there is no
  background aggregation or tree polling.
- The report module, jsPDF and its rendering chunks load only when a report or
  full export is generated.
- Outside a running Pomodoro, the only recurring timer is the smart-reminder
  check: every 15 minutes, only while the window is visible, reminders are enabled
  and do-not-disturb is off. It stops on hide and becomes a no-op once today’s
  notification is sent.
- Score, XP, badges and challenge progress are derived from data already loaded by
  the dashboard; reports and cards are generated on demand.
- The Pomodoro interval exists only while the timer is running and the window is
  visible; hiding the widget pauses it.
- AI summaries, encrypted backups and restores are one-shot actions. There is no
  background sync, polling or network request on launch.
- Evidence thumbnails are only read when they are near the viewport; gallery reads
  stop when the dashboard is hidden.
- Search and dashboard queries are scoped by goal and, when set, date range;
  indexes cover `date`, `skill_tag`, `goal_id`, evidence and the skill/milestone
  link tables.
- Skill time is aggregated in SQL; weekly confidence is rolled up in the chart
  chunk from daily averages.

## Project layout

```
src/
  App.tsx                    widget shell, tabs, idle auto-hide
  components/
    WindowChrome.tsx         draggable title bar, quick-log/hide buttons
    TabBar.tsx               Log / Dashboard / Search / Skills / Review / Settings
    GoalSetup.tsx            one-time goal form + empty state
    MilestoneEditor.tsx      inline milestone form, links and completion
    EvidenceGallery.tsx      goal/milestone portfolio with lazy images
    StrikerScoreCard.tsx     score total, weighted breakdown and tooltip
    GamificationCard.tsx     XP, badges and 7-day challenge progress
    FlashcardsPanel.tsx      due-card queue, SM-2 grading, suggestions, card list
    PomodoroCard.tsx         visible-only focus timer that logs to today's entry
    settings/                Integrations, AI, Sync and Encryption sections
    skills/                  lazy React Flow canvas + JSON import/export panel
    Highlight.tsx            search match highlighting
    tabs/                    LogTab, DashboardTab, SearchTab, SkillsTab, ReviewTab, SettingsTab
    charts/                  lazy-loaded Recharts dashboard charts
    ui.tsx, icons.tsx        primitives and inline SVG icons
  hooks/
    useTauriBridge.ts        store hydration + window/tray/hotkey events
    useIdleAutoHide.ts       single timeout, cleared when hidden
    useSmartReminders.ts     visible-only reminder timer, one notification a day
  lib/
    db.ts                    SQLite queries, search, evidence and milestone writes
    dates.ts                 local date keys, ISO weeks, month/quarter ranges
    srs.ts                   SM-2 scheduler and interval labels
    reminders.ts             reminder priority and message selection
    notifications.ts         Tauri notification permission + send helper
    stats.ts                 streaks, heatmap levels, weekly progress
    score.ts                 weighted Striker Score calculation
    gamification.ts          XP, badges and challenge progress
    evidence.ts              file import, evidence naming, image data URLs
    report.ts                report model, Markdown template, PDF renderer
    export.ts                JSON/CSV serialization + Rust commands
    crypto.ts                Web Crypto helpers, AES-GCM and PBKDF2
    secrets.ts               encrypted setting read/write with the device key
    backup.ts                passphrase-encrypted backup envelope
    sync.ts                  local-folder/WebDAV upload and download
    ai.ts                    Ollama/OpenAI-compatible weekly summarization
    calendar.ts              RFC 5545 weekly plan export
    integrations.ts          GitHub/ArtStation/Blender evidence validation
    skillTree.ts             roadmap v1 schema, validation, export and AI prompt
  store/useAppStore.ts       Zustand state
src-tauri/
  src/lib.rs                 migrations, tray, hotkey, window placement, export/evidence commands
  tauri.conf.json            window + bundle configuration
  capabilities/default.json  least-privilege permissions
```

## Window configuration

The window in `src-tauri/tauri.conf.json` uses:

```json
{
  "width": 420,
  "height": 640,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "shadow": false
}
```

Rounded corners come from the root element in `src/App.tsx`
(`rounded-[18px]`). Startup placement happens in Rust (`place_bottom_right`):
primary monitor size minus window size, 24 px from the right and 64 px from the
bottom to clear the taskbar.

## Permissions

`src-tauri/capabilities/default.json` grants only what the UI uses: window
show/hide/focus/drag, event listening, SQL select/execute/load/close, the
auto-start state, notification send/permission and scoped HTTP requests for the
user-configured AI/WebDAV endpoints (`http` and `https`, any host and port).
Markdown/JSON/CSV/PDF export, evidence copying, image reads and local-folder sync
use Rust commands, so no filesystem, dialog or shell plugin scope is needed.
`open_external` accepts only `http(s)` URLs and absolute local paths;
evidence files are read only from the app-data `evidence` folder. Local sync
writes only to the absolute folder the user chooses and caps files at 32 MB.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `link.exe not found` / `cargo build` fails on Windows | Install VS Build Tools 2022 with **Desktop development with C++** and the Windows SDK. |
| Blank or black window | Update the WebView2 Runtime; make sure Windows transparency effects are enabled. |
| Hotkey does nothing | Another app owns `Ctrl+Shift+S`; change `HOTKEY` in `lib.rs`. |
| Auto-start toggle reports an error | Check Windows **Settings → Apps → Startup** and that the executable path still exists. |
| Source/evidence link does not open | Only `http(s)` links and absolute file paths are allowed; check the path exists. |
| Evidence image is blank in the gallery | The file must still exist under the app-data `evidence` folder; legacy paths outside it cannot be previewed. |
| PDF report has no image thumbnails | Only PNG/JPEG evidence can be embedded; other formats are listed in the gallery. |
| PDF export reports a size error | PDFs are capped at 32 MB; reduce embedded evidence or export Markdown. |
| No reminder notification appears | Check Settings → Reminders and Windows notification permission for Striker. Reminders never run while hidden, during do-not-disturb, or twice in one day. |
| `Port 1420 is already in use` | Stop the other Vite instance or change the port in `vite.config.ts` **and** `devUrl`. |
| Tray icon missing | Windows hides overflow icons by default; drag it out of the tray overflow. |
| Installer warns about an unknown publisher | Expected for unsigned builds. |

## MVP limitations

- Reminders only run while the widget is open; there is no background scheduler.
- One active goal at a time (no switching/archiving UI). Monthly/quarterly reports
  use the active goal; full-data exports include every goal.
- Entries cannot be edited or deleted after logging; skills and evidence are chosen
  at log time. Removing a pending attachment does not delete the copied file.
- Evidence files are capped at 8 MB and only PNG/JPEG images are embedded in PDF
  reports; all evidence is listed in Markdown.
- Milestone completion is manual (from the milestone editor), which is what drives
  the milestone score component, badges and report counts.
- The milestone link picker lists the 50 most recent entries.
- Skill roadmaps support arbitrary depth. Very large trees render all nodes in
  Tree view; Roadmap view windows the list, so use Roadmap view for 500+ nodes.
- Deleting a tree removes its nodes and entry links; there is no undo.
- Skill diversity full marks require five distinct nodes in the last 30 days.
- Dashboard charts show the top six skill nodes by time and the top four by
  confidence; the rest are grouped or omitted from those series.
- The widget is repositioned to the bottom-right of the primary monitor on every
  launch; a dragged position is not persisted.
- Windows-first: Linux/macOS are untested.
- SQLCipher encryption of the live database is not available with stock
  `tauri-plugin-sql`; only secrets and encrypted backups are protected.
- Sync is manual backup/restore, not merge. Restoring replaces local data and
  does not copy evidence binaries.
- The AI prompt includes only the selected week's entries and is truncated at
  12,000 characters; very long notes can be shortened.
