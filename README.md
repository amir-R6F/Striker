# Striker Mini

Striker Mini is the lightweight variant of [Striker](../..). It is a tiny desktop
companion for one loop:

> **Pick a tree → check what you did today → strike the day.**

It has two screens: **Focus** and **Settings**. There is no dashboard, search,
flashcards, evidence, AI, sync, reports, or chart view.

Striker Mini lives on the orphan branch `mini`. It is its own project with its own
Git history, bundle identifier, database, and schema. Full Striker on `main` is
untouched and the two apps never share a database.

| | Full Striker (`main`) | Striker Mini (`mini`) |
| --- | --- | --- |
| Bundle identifier | Full's identifier | `com.striker.desktop.mini` |
| Database file | Full's DB | `striker-mini.db` |
| Schema | 44 migrations | one migration, `001_init.sql` |
| Screens | many | Focus + Settings |
| Tree JSON | schema v1 | **same schema v1** |

Trees are portable: export a tree from Mini and import it into Full Striker, or
the reverse. Both use the same JSON schema, so no conversion is needed.

## What it does

- **Streak** — consecutive days with at least one strike for the selected tree.
- **Tree switcher** — shows every tree and a ✓ on trees already struck today.
- **React Flow tree** — Full Striker's dotted pan/zoom canvas and rectangular
  cards with an internal progress bar; branches expand/collapse and leaves are
  checkable. Branches with a node struck in the last two days start expanded.
- **Per-node progress** — every strike on a leaf fills 25% of its bar (four
  strikes fill it). Parent nodes show the recursive average of their children.
- **Strike** — saves one strike for today with the checked nodes. Minutes are the
  sum of the checked nodes' estimated hours, with a 15-minute fallback.
- **Edit strike** — the button becomes "Struck today — edit"; it pre-checks
  today's nodes and updates the strike. Unchecking everything and confirming
  removes today's strike.

Nothing is saved until you strike. There is no autosave or polling.

## Settings

- Theme: Light / Dark / System.
- Idle hide after N minutes (default 5).
- Show or hide the `N×` strike-count badges.
- Start with Windows (registers a per-user Run entry; Windows only).
- Reset browser database (browser mode only, after confirmation).
- Tree actions: import, export, and create a blank tree.
- About: version, branch (`mini`), and the SQLite path.

## Import and export

Mini reads and writes the same **schema v1** JSON as Full Striker:

```json
{
  "schema_version": 1,
  "title": "Blender Fundamentals",
  "description": "",
  "source": "imported",
  "created_at": "2026-11-10T00:00:00.000Z",
  "nodes": [
    {
      "id": "modeling",
      "title": "Modeling",
      "description": "",
      "parent_id": null,
      "order": 1,
      "tags": ["basics"],
      "estimated_hours": 10,
      "resources": [
        { "type": "article", "label": "Reference", "url": "https://example.com" }
      ],
      "children": ["bevel"]
    },
    {
      "id": "bevel",
      "title": "Bevel",
      "description": "",
      "parent_id": "modeling",
      "order": 1,
      "tags": [],
      "estimated_hours": 2,
      "resources": [],
      "children": []
    }
  ]
}
```

Import accepts a file chosen with the native picker or pasted text. It validates
the document (schema version, unique IDs, valid parents, no cycles, consistent
`parent_id`/`children`) and reports errors in the sheet. Modes:

- **Merge** — add or update nodes in the current tree.
- **Replace** — replace the selected tree's nodes, keeping its identity.
- **Append** — add the imported tree as a new tree (the only mode offered while
  no tree exists; onboarding imports always become a new tree).

The **Copy AI prompt** button copies a ready-made prompt containing the schema and
an example, so any AI can generate a compatible tree.

Tags and resources are stored as JSON on each node and round-trip exactly.
Resources use `{ type, label?, url? }`; legacy Full Striker resources that use
`{ title, url }` are still accepted so older files import unchanged.

## Development

Requirements: Node.js 20.19+ and npm.

```bash
npm install
npm run dev        # browser mode with sql.js, no Rust required
npm test           # focused Vitest suite (migration, roadmap, progress)
npm run check      # tsc --noEmit + production web build
npm run tauri:dev  # real desktop app (requires the Rust toolchain)
```

`npm run tauri:build` builds the Windows installer. Tauri builds expect the
`dist/` output from `npm run build`.

### Browser mode

Without Tauri, the app runs in any modern browser against a mock database layer
backed by **sql.js**. The entire focus flow, import/export, settings, themes, and
persistence work without Rust. Data is stored in `localStorage` under:

```
striker-mini-browser-db
```

That key is distinct from Full Striker's, so the two can run side by side in the
same browser origin. Use **Settings → Reset browser database** to clear it.

The mock loads `src-tauri/migrations/*.sql` directly and also ships a committed
snapshot in `src/lib/browser/migrations.generated.ts`. After changing a migration,
regenerate the snapshot with:

```bash
node scripts/extract-migrations.mjs
```

### Desktop app

The Tauri shell wraps the same React app and stores data in SQLite at:

- Windows: `%APPDATA%\com.striker.desktop.mini\striker-mini.db`
- macOS: `~/Library/Application Support/com.striker.desktop.mini/striker-mini.db`
- Linux: `~/.local/share/com.striker.desktop.mini/striker-mini.db`

The window is a 420×640 frameless, transparent, always-on-top widget placed in the
bottom-right corner. Closing it hides it; the tray icon toggles visibility and
offers Quit.

## Schema

Mini has two migrations: `src-tauri/migrations/001_init.sql` and
`002_node_meta.sql` (adds `tags` and `resources_json`):

- `trees` — one row per tree.
- `tree_nodes` — nested nodes (`parent_id` self-reference, ordered by
  `order_index`).
- `strikes` — one strike per tree per day (unique index on `tree_id, date`).
- `strike_nodes` — which nodes were checked on a strike.
- `settings` — key/value settings, including the tree's original `source`.

Tree source metadata has no dedicated column, so it is kept in `settings` under
`tree_source:<tree_id>`.

## Project layout

```
src/
  App.tsx                 onboarding / focus routing
  components/             FocusScreen, TreeCanvas, ImportSheet, SettingsSheet, ...
  hooks/                  theme, idle auto-hide, window bridge
  lib/
    db.ts                 SQLite queries and transactions
    progress.ts           tree progress, streaks, strike minutes
    treeLayout.ts         pure visible-node layout used by React Flow
    roadmap.ts            schema v1 parse/validate/build + AI prompt
    export.ts             JSON export and downloads
    autostart.ts          Windows auto-start bridge
    browser/              sql.js mock layer used outside Tauri
  store/useMiniStore.ts   app state, tree views, progress, streaks
src-tauri/
  migrations/001_init.sql
  src/lib.rs              Tauri setup, tray, commands, migrations
scripts/extract-migrations.mjs
tests/                    migration, roadmap validation, progress tests
```

## License

Same as the parent Striker repository.
