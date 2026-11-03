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
- `agent-workspace/` working folder Codex runs in; `AGENTS.md` holds the agent's standing rules
- `scripts/` start/stop scripts
- `data/` (git-ignored) database, per-run Codex logs (`data/runs/<id>/`), server logs
