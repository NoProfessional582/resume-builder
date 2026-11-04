# Resume Builder

Resume Builder is a local Windows app for managing your job search, developing your work-history
stories, and creating tailored résumés. Keep your experience in one place, analyze job postings,
and generate a `.docx` résumé using the formatting of your existing résumé.

The app runs on your PC and stores your data locally. AI features use the
[Codex CLI](https://github.com/openai/codex), signed in with your ChatGPT account.

## Features

- **Résumé import and templates:** import an existing `.docx` résumé, review its content, and reuse
  its formatting for tailored résumés, with previews and page-count fitting.
- **Work history:** organize positions and detailed experience stories. Refine stories with an AI
  conversation to develop impact, results, and supporting details.
- **Job analysis and tailored résumés:** add a posting by text or link, identify relevant keywords
  and experience, then review and download a tailored `.docx` résumé.
- **Application tracking:** manage application stages, activity history, and shared contacts. Use
  List or Board view with search, filters, company grouping, sorting, and drag-and-drop stage changes.
- **Agenda and next actions:** track interviews, screenings, assessments, deadlines, and follow-ups.
  Link contacts, reschedule events, and manage completion or cancellation in your chosen display timezone.
- **Follow-up suggestions:** see due actions and applications that need attention, with configurable
  thresholds, snoozing, dismissal, and follow-up recording.
- **Interview preparation:** generate expected questions and suggested story matches from a posting.
  Develop Situation, Task, Action, Result, and Lessons learned through an AI coach or manual editing.
  Save drafts, speaking notes, and practice notes, and review recommended story updates before
  saving them to work history.
- **Local backups:** back up your database and résumé templates from Settings, with automatic daily
  backups when you start the app.

## System requirements

| Requirement | Purpose |
|---|---|
| **Windows 10 or 11** | Runs the included start/stop scripts and Word integration. |
| **Node.js 24 or newer** | Runs the app. |
| **Microsoft Word desktop app** | Required for résumé import, PDF previews, and page counting. |
| **Codex CLI and a ChatGPT account with Codex access** | Required for AI features. |
| **Your current résumé as a `.docx` file** | Provides the content and formatting for résumé import and generation. |
| **Internet access** | Needed to install dependencies, use AI features, and fetch linked job postings. |

## Installation

1. **Install Node.js 24 or newer** from [nodejs.org](https://nodejs.org). Open a new PowerShell
   window and run `node --version` to check the installed version.
2. **Install and sign in to Codex.** In PowerShell, run:

   ```powershell
   npm install -g @openai/codex
   codex login
   ```

   Follow the browser sign-in with your ChatGPT account.
3. **Download the app.** On GitHub, choose **Code → Download ZIP** and extract it to a folder such
   as `Documents\resume-builder`, or clone this repository with Git.
4. **Start the app.** Double-click **Start Resume Builder.cmd** in the app folder. The first start
   installs dependencies, builds the app, and opens [Resume Builder](http://127.0.0.1:4310) in your
   browser. The app continues running in the background after the start window closes.

To reopen the app, visit that address or double-click the start file again. To stop it,
double-click **Stop Resume Builder.cmd**.

### First run

1. Open **Settings** and click **Test Codex** to check your AI connection.
2. Open **Template**, upload your `.docx` résumé, review the preview, and click **Import this resume**.
3. Review **Work History** and use **Refine story** to develop your experience.
4. Open **Applications**, click **New application**, and paste a job posting or link. Analyze the
   posting, tailor your résumé, and review the result before downloading it.

You can also track stages, contacts, events, follow-ups, and interview preparation within each application.

To customize the agent's writing rules, edit `agent-workspace/STYLE_GUIDE.md`. Keep its four
top-level headings. Changes apply to the next AI run without restarting the app.

### Command-line startup

From the app folder:

```powershell
npm run service:start   # install if needed, build, start in the background, open the browser
npm run service:stop    # stop the app
```

For a different port:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Port 4400
```

### Troubleshooting

| Problem | Fix |
|---|---|
| Node.js is missing or too old | Install Node.js 24 or newer, then open a new window and try again. |
| Codex CLI not found | Run `npm install -g @openai/codex`, or set **Settings → Codex path** to your installation. |
| Not signed in or usage-limit errors | Run `codex login` to sign in. Usage limits depend on your account. |
| Word conversion failed | Make sure Word opens normally without an activation or sign-in dialog, then close it and retry. |
| Port 4310 is in use | Start with a different port using the command above. |
| Other errors | Check `data/logs/server.err.log` and the **Agent Runs** page. |

## Your data

Everything you create is saved in the `data/` folder inside the app folder. That includes the
database, imported files, generated résumés, logs and backups. The folder is git-ignored.
AI features send relevant content through Codex for processing; local storage does not mean AI
processing happens entirely on your PC.

- **Backups:** go to **Settings → Backups → Back up now**. The app also makes one automatically at
  startup when the newest is more than a day old, and keeps the newest 20 in `data/backups/`.
- **Restore:** stop the app, replace `data/app.db` with the backup's `app.db` (and delete
  `app.db-wal` and `app.db-shm`), copy the backup's `templates/` folder into `data/templates/`, then
  start the app.
- **Updating the app:** stop it, then replace the app files with the new version (or run
  `git pull`). Keep your `data/` folder, and keep `agent-workspace/STYLE_GUIDE.md` if you changed it.
  Then start it again. Database changes are applied automatically.

## License

[MIT](LICENSE)

## For developers

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the server with auto-restart on port 4310 and Vite with hot reload on http://localhost:5173 |
| `npm run build` | Build the web app into `web/dist/` |
| `npm start` | Run the server in the foreground, serving `web/dist/` if built |
| `npm run typecheck` | Type-check server and web |
| `npm run test:phase1` | Check application workspace behavior |
| `npm run test:phase2a` | Check events and agenda behavior |
| `npm run test:phase2b` | Check follow-up attention rules |
| `npm run test:phase3` | Check interview preparation behavior |

Repository layout:

- `server/`: Fastify API, SQLite (`node:sqlite`), database migrations in `server/migrations/`,
  Codex runner in `server/src/agent/`, and `.docx` engine in `server/src/docx/`.
- `web/`: React, Vite, and Tailwind UI.
- `agent-workspace/`: the read-only folder Codex runs in. `AGENTS.md` contains standing agent rules;
  `STYLE_GUIDE.md` contains writing rules.
- `scripts/`: start/stop scripts and Word PDF export.
- `data/` (git-ignored): database, per-run Codex logs in `data/runs/<id>/`, server logs, generated
  résumés in `data/applications/<id>/`, and backups.

Environment variables: `PORT` (default `4310`), `HOST` (default `127.0.0.1`), `RB_DATA_DIR`
(default `data/`), and `RB_CODEX_PATH` (Codex path if automatic discovery fails).
