# Resume Builder

Local app for building tailored resumes from a library of work stories, using the Codex CLI
(`codex exec`) for AI tasks. See [PLAN.md](PLAN.md) for the full design and milestones.

## Requirements

- Node.js 24+ (the server runs TypeScript directly and uses the built-in `node:sqlite`)
- Codex CLI: `npm i -g @openai/codex`, then `codex login`

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run service:start` | Build the web app and start the server in the background at http://127.0.0.1:4310 (survives the Claude app closing) |
| `npm run service:stop` | Stop the background server |
| `npm run dev` | Development: server with auto-restart on :4310 + Vite on http://localhost:5173 |
| `npm run typecheck` | Type-check server and web |

## Layout

- `server/` Fastify API, SQLite (`server/migrations/*.sql`), Codex runner (`server/src/agent/`)
- `web/` React + Vite UI
- `agent-workspace/` working folder Codex runs in; `AGENTS.md` holds the agent's standing rules and
  `STYLE_GUIDE.md` your writing rules. The guide's top-level parts ("Rules for all writing",
  "Stories", "Résumé content", "Final quality check") are pasted into the prompts that need them;
  edits apply to the next agent run, no restart needed. Keep those four headings.
- `scripts/` start/stop scripts
- `data/` (git-ignored) database, per-run Codex logs (`data/runs/<id>/`), server logs, generated
  résumés (`data/applications/<id>/`) and backups (`data/backups/`)

## Backups

Settings → Backups → **Back up now** writes `data/backups/backup-YYYYMMDD-HHMMSS.zip` (database,
template file, style guide, and a README with restore steps). One is made automatically at startup
when the newest is more than a day old; the newest 20 are kept. To restore: stop the service, replace
`data/app.db` (and delete `app.db-wal` / `app.db-shm`) with the backup's `app.db`, copy its
`templates/` folder into `data/templates/`, then start the service.
