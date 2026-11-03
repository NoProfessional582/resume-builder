# Resume Builder

A local app that keeps your full work history as detailed "stories," helps you strengthen them with
an AI agent, analyzes job postings, and builds a tailored `.docx` résumé for each application in your
own résumé's formatting.

Everything runs on your own PC: your data stays in a local database. The AI work goes through the
[Codex CLI](https://github.com/openai/codex), signed in with your ChatGPT account. See
[PLAN.md](PLAN.md) for the full design.

## What you need

| | Why |
|---|---|
| **Windows 10 or 11** | The start scripts and the Word integration are Windows-only. |
| **Microsoft Word** (desktop app) | Converts résumés to PDF to count pages and show previews. Importing a résumé needs it. |
| **[Node.js](https://nodejs.org) 24 or newer** | Runs the app. Pick the "LTS" installer if it's version 24 or newer. |
| **A ChatGPT account** with Codex access (Plus, Pro, Business, etc.) | Codex uses it for the AI features. |
| **Your current résumé as a `.docx` file** | The app copies its formatting and imports its content. |

## Setup (once)

1. **Install Node.js.** Download it from <https://nodejs.org> and run the installer with the
   default options. To check it worked, open a new PowerShell window and run `node --version`. It
   should print `v24` or higher.

2. **Install and sign in to Codex.** In PowerShell, run:

   ```powershell
   npm install -g @openai/codex
   codex login
   ```

   `codex login` opens your browser. Sign in with your ChatGPT account.

3. **Download this app.** Either:
   - On GitHub, click **Code → Download ZIP** and unzip it to a folder such as
     `Documents\resume-builder`, or
   - Clone it: `git clone <this repo's URL>`

## Start the app

Double-click **`Start Resume Builder.cmd`** in the app folder.

The first time, it installs dependencies (about a minute), then starts the app and opens
<http://127.0.0.1:4310> in your browser. Later starts take a few seconds. The app keeps running in
the background after the window closes. To open it again, go back to that address or double-click
the start file again.

To stop it, double-click **`Stop Resume Builder.cmd`**.

If Windows shows "Windows protected your PC" for a file you downloaded, click **More info → Run
anyway**.

<details>
<summary>Prefer the command line?</summary>

From the app folder:

```powershell
npm run service:start   # install if needed, build, start in the background, open the browser
npm run service:stop    # stop it
```

To use a different port: `powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Port 4400`.
</details>

## First run

1. **Settings.** Open **Settings** (left sidebar) and click **Test Codex**. It should finish in
   about 15 seconds. If it says you're not signed in, run `codex login` again.
2. **Template.** On the **Template** page, upload your résumé (`.docx`). The app reads your work
   history and other sections from it. Review the preview, then click **Import this resume**. From
   then on, the file is used as the layout for every tailored résumé.
3. **Work History.** Check your positions and click **Refine story** on any story. The agent asks follow-up
   questions about impact, results and metrics, and folds your answers into the story.
4. **Applications.** Click **New application**, then paste a job posting or a link to one. The app
   pulls out the keywords, tailors your résumé to the job, fits it to your page count, and lets you
   review and download the `.docx`.

**Optional:** edit `agent-workspace/STYLE_GUIDE.md` to change the writing rules the agent follows.
Changes apply to the next AI run, with no restart needed. Keep its four top-level headings.

## Your data

Everything you create is saved in the `data/` folder inside the app folder. That includes the
database, imported files, generated résumés, logs and backups. The folder is never uploaded or
committed to git.

- **Backups:** go to **Settings → Backups → Back up now**. The app also makes one automatically at
  startup when the newest is more than a day old, and keeps the newest 20 in `data/backups/`.
- **Restore:** stop the app, replace `data/app.db` with the backup's `app.db` (and delete
  `app.db-wal` and `app.db-shm`), copy the backup's `templates/` folder into `data/templates/`, then
  start the app.
- **Updating the app:** stop it, then replace the app files with the new version (or run
  `git pull`). Keep your `data/` folder, and keep `agent-workspace/STYLE_GUIDE.md` if you changed it.
  Then start it again. Database changes are applied automatically.

## Troubleshooting

| Problem | Fix |
|---|---|
| The start window says Node.js is missing or too old | Install Node.js 24+ from <https://nodejs.org>, then open a **new** window and try again. |
| "Codex CLI not found" | Run `npm install -g @openai/codex`. If Codex is installed somewhere else, set its path in **Settings → Codex path**. |
| "Not signed in" or usage-limit errors | Run `codex login`. Limits come from your ChatGPT plan. |
| Importing a résumé fails with "Word conversion failed" | Make sure Microsoft Word opens normally and isn't showing a dialog (like a sign-in or activation prompt). Close Word and try again. |
| Port 4310 is already in use | Start on another port (see "Prefer the command line?" above). |
| Something else | Check `data/logs/server.err.log`, and the **Agent Runs** page for AI task details. |

## For developers

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Server with auto-restart on :4310 + Vite with hot reload on http://localhost:5173 |
| `npm run build` | Build the web app into `web/dist/` |
| `npm start` | Run the server in the foreground (serves `web/dist/` if built) |
| `npm run typecheck` | Type-check server and web |

Layout:

- `server/`: Fastify API, SQLite (`node:sqlite`, migrations in `server/migrations/`), Codex runner
  (`server/src/agent/`), `.docx` engine (`server/src/docx/`)
- `web/`: React + Vite + Tailwind UI
- `agent-workspace/`: the read-only folder Codex runs in. `AGENTS.md` holds the agent's standing
  rules and `STYLE_GUIDE.md` holds the writing rules.
- `scripts/`: start/stop scripts and the Word PDF export
- `data/` (git-ignored): database, per-run Codex logs (`data/runs/<id>/`), server logs, generated
  résumés (`data/applications/<id>/`) and backups

Environment variables: `PORT` (default 4310), `HOST` (default 127.0.0.1), `RB_DATA_DIR` (default
`data/`), `RB_CODEX_PATH` (path to Codex, if it can't be found automatically).

## License

[MIT](LICENSE)
