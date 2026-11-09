# Windows verification checklist

Manual checks that cannot run in CI or on a non-Windows host. Run everything on
both **Windows 10 (22H2)** and **Windows 11 (23H2 or newer)**, and record the
build number and WebView2 version.

## Build and launch

- [ ] `npm ci` and `npm run check` pass (typecheck, Vitest, production build).
- [ ] `npm run tauri:build` produces `striker.exe` and the NSIS installer.
- [ ] Fresh install launches without a missing WebView2 or VC++ runtime error.
- [ ] App starts on a machine with no `striker.db`; onboarding appears once.
- [ ] App starts with an existing v5 database; no data is lost.

## Window, transparency and positioning

- [ ] Widget is 420×640, borderless, and has no taskbar button.
- [ ] Rounded corners and transparency render correctly with Windows
      transparency effects both on and off.
- [ ] Always-on-top holds over a maximized browser and over File Explorer.
- [ ] Initial placement sits above the taskbar on 100%, 125%, 150% and 200%
      display scaling, and on a mixed-DPI multi-monitor setup.
- [ ] Dragging works from the header only (not from inputs or buttons).
- [ ] Hide (minus button) and show (tray) restore focus and size correctly.

## Tray and hotkey

- [ ] Tray icon appears; left click toggles; right click opens the menu without
      also toggling.
- [ ] Tray menu Show / Hide, Quick Log and Quit all work.
- [ ] Quick Log opens the widget and focuses the learned field.
- [ ] `Ctrl+Shift+S` toggles the widget globally, including when another app has
      focus; a second press hides it again.
- [ ] If another app owns `Ctrl+Shift+S`, the hotkey registration failure is
      visible in the console/log and the app still starts.
- [ ] Closing the window parks it in the tray instead of quitting; Quit exits.

## Auto-start and idle

- [ ] Auto-start registers in **Settings → Apps → Startup** and starts hidden.
- [ ] Auto-start unregisters cleanly and does not leave a stale entry.
- [ ] Idle auto-hide fires at the configured minute value and does not fire while
      typing or while the widget is already hidden.
- [ ] The Pomodoro timer pauses while hidden and resumes without adding hidden
      minutes.

## Migrations and backups

- [ ] Copy an old (schema 4) database into `%APPDATA%\com.striker.desktop\` and
      launch: migrations run, legacy skills become a roadmap, entries keep links.
- [ ] Before the migration, `striker.db.bak-YYYYMMDD-HHMMSS` appears next to the
      database; its contents pass `PRAGMA integrity_check`.
- [ ] Trigger six migrations in a row: only the five newest automatic backups
      remain.
- [ ] Launch again with the schema current: **no** new `.bak-` file is created.
- [ ] Delete the database and relaunch: no backup is attempted for an empty file.
- [ ] Fill the disk or make the database folder read-only and relaunch: the app
      still opens (backup failure is logged, not fatal) and migrations either
      succeed or show a clear error.
- [ ] `Settings → Data → Backup database now` with `D:\Backups\Striker` writes
      `striker-backup-*.db`; opening the copy with a SQLite browser shows recent
      entries, including ones written just before the copy.
- [ ] Backup to a UNC path, a OneDrive-synced folder, and a path with spaces and
      non-ASCII characters.
- [ ] Backup with a relative path is rejected; a path on a disconnected network
      drive fails with a toast rather than crashing.

## Evidence folder permissions

- [ ] Attach a PNG and a PDF up to 8 MB from Desktop and from a network share.
- [ ] Attach a file over 8 MB and an unsupported extension: clear error, no partial
      file left in `%APPDATA%\com.striker.desktop\evidence\`.
- [ ] Attach a file whose name contains spaces, Cyrillic, `#`, `%` and `+`.
- [ ] Evidence gallery previews images and PDFs are listed but not previewed.
- [ ] Remove an attachment and accept the second prompt: the copied file is gone
      from `evidence/` and the entry still loads.
- [ ] Remove an attachment and decline the file prompt: the row disappears, the
      file remains.
- [ ] Delete an entry with "also delete files" and verify all copies are removed.
- [ ] Point an evidence row at `C:\Windows\notepad.exe` directly in SQLite and try
      to delete it: the Rust command refuses (path outside the evidence folder).
- [ ] Run Striker from a portable folder or a path with spaces; copying evidence
      still works.
- [ ] With Controlled Folder Access enabled, confirm the antivirus prompt appears
      and the failure is surfaced as a toast.

## Notifications and the Rust scheduler

- [ ] First launch prompts for notification permission (Windows settings page or
      in-app prompt) exactly once.
- [ ] With permission denied, no toast appears and the app does not crash.
- [ ] Set the wake hour to one minute from now, restart Striker, and confirm
      exactly one check runs at that time (log line or toast).
- [ ] Do-not-disturb on: no toast, but the check still runs.
- [ ] Disable one category: only that category is skipped.
- [ ] Two days with no entry: quiet-day toast appears once; trigger the check
      again the same day and no second toast appears.
- [ ] Three days of entries mentioning only watch/read/course/video: input-only
      toast appears.
- [ ] Sunday with no saved review: weekly review toast appears instead of the
      other two.
- [ ] Leave the app in the tray for 24 hours: Task Manager shows near-zero CPU
      between checks; there is no WebView wake or re-render.
- [ ] Change the configured hour while the app is running: verify when the new
      value takes effect (next sleep cycle).
- [ ] Sleep/resume and DST transitions: the next check still lands on the chosen
      local hour, not 23 or 25 hours later.
- [ ] Windows Focus Assist / notification banner settings are respected.

## Sync and encryption

- [ ] Local-folder sync writes `striker-backup.striker` to an absolute folder and
      reads it back.
- [ ] WebDAV PUT/GET works with and without Basic auth; a wrong password shows the
      HTTP status instead of a generic failure.
- [ ] Restoring an encrypted backup with the wrong passphrase is rejected.
- [ ] Restore on a second Windows machine keeps goals, trees, links, milestones
      and cards; evidence paths that do not exist show the documented fallback.
- [ ] A sync file larger than 32 MB is rejected.

## Editing, deleting and multi-goal

- [ ] Edit an entry from Log and from Search; reload the app and confirm the
      change, renamed attachment labels and reordered attachments persist.
- [ ] Edit an entry to remove all skill links; Dashboard and Search no longer
      count it for those nodes.
- [ ] Delete an entry linked to a milestone: milestone count drops, no foreign-key
      error appears.
- [ ] Delete an entry linked to a flashcard: the card remains, unlinked.
- [ ] Edit a flashcard front/back from **All cards**; scheduling state (ease,
      interval, reps) is unchanged.
- [ ] Create a second goal, switch from the header: Log, Dashboard, Search,
      Review and Skills all show only that goal's data.
- [ ] Set a default goal, restart: that goal is active when it still exists.
- [ ] Archive a goal: it disappears from the switcher and its data is still in
      exports/reports.
- [ ] Archive the only goal: onboarding reappears and a new goal can be created.
- [ ] Onboarding import creates a skyline tree with editable nodes; deleting and
      renaming nodes works.

## Reports and exports

- [ ] JSON, CSV, Markdown and PDF exports write to Downloads and open correctly
      (Excel for CSV with non-ASCII text; Edge/Acrobat for PDF).
- [ ] Filenames with an existing copy receive `-1`, `-2` suffixes.
- [ ] Monthly and quarterly reports include evidence thumbnails when the files are
      PNG/JPEG and list the rest.
- [ ] Exporting while the app-data folder is read-only shows a toast, not a crash.

## Security checks

- [ ] `open_external` refuses `file://`, relative paths and shell-like arguments.
- [ ] A crafted evidence path using `..` cannot read or delete outside the
      evidence folder.
- [ ] Secrets (AI key, WebDAV password) never appear in JSON/CSV exports.
- [ ] The main window never navigates to an external URL.
