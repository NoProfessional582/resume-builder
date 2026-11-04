# Resume Builder

A local app that keeps your full work history as detailed "stories," helps you strengthen them with
an AI agent, analyzes job postings, and builds a tailored `.docx` résumé for each application in your
own résumé's formatting.

Everything runs on your own PC: your data stays in a local database. The AI work goes through the
[Codex CLI](https://github.com/openai/codex), signed in with your ChatGPT account. See
[PLAN.md](PLAN.md) for the original design and implementation history. See
[MASTER_PLAN.md](MASTER_PLAN.md) for the phased expansion into application tracking, contacts,
scheduling, follow-up alerts, and interview preparation.

Phase 1 adds application stages, dated activity and history, reusable contacts, and a List/Board
switch with saved search, filters, company grouping, and sorting. Open an application's **Overview**
to manage its stage, activity, and contacts; Analysis, Posting, and Résumé remain available.
Existing applications show **Set stage** until you classify them. See [PHASE_1_PLAN.md](PHASE_1_PLAN.md)
for implementation decisions. Restart the app after updating to apply the new database migration.
In Board view, drag a card to another stage to update it. Offer and Cancelled/declined drops ask
for details before saving. Use the **List** and **Board** buttons to switch views. Open an application
to change its stage with keyboard or touch controls, or to open the original posting.

## What you need

Phase 3 adds **Interview prep** inside each application. Choose a source story (direct job-keyword
matches explain the suggested order), enter a question, and start preparation. Draft with AI or
edit Situation, Task, Action, Result, speaking notes, and practice notes yourself. **Save draft**
persists edits; sending a conversation turn also saves them. **Accept answer** keeps the answer
separate from work history; reopen it whenever you want to make changes. Save before navigating away.
Failed or cancelled turns preserve saved edits and the conversation for retry.

Source-story and analysis changes show a review warning. Deleted stories leave the preparation's
original snapshot available. **Review source update** lets you explicitly edit the complete factual
story and save a new work-history version; concurrent source edits are rejected. Deleting an
application deletes its preparation sessions, while shared stories remain. All preparation data is
included in database backups. Restart the app after updating to apply migration 013.
See [Phase 3 plan](docs/plans/PHASE_3_PLAN.md) for verification details.

The revised workflow starts with **Expected interview questions**. New job analyses generate
posting-based questions automatically. For existing applications, click **Generate questions &
story matches** to get questions and agent-selected experiences without replacing your analysis.
Each match explains its relevance and what to develop; additional useful stories and evidence gaps
appear separately. **Prepare this story** opens a manual or conversational **S.T.A.R.L** editor,
including Lessons learned. The agent asks specific questions about missing facts and proposes
expanded work-history text and lessons. **Review & save to work history** shows the current original
and proposed update before saving both, with conflict detection. Save your draft before reviewing
source updates. Refresh the plan after source edits to update matches. Migration 014 adds plan
snapshots and source-update history; existing answers are preserved.

**Prepare this story** opens an agent-led modal. The coach automatically evaluates the existing
experience against the selected question and asks focused questions before building the answer.
Reply conversationally to develop the S.T.A.R.L story. **Edit manually (optional)** reveals the
secondary form. Close or press Escape to return to the page; reopening resumes saved progress
and does not repeat the opening assessment. Review and save new facts to Work History as before.

To improve the original work-history experience, use **Recommend story update** in the modal.
A separate agent review integrates applicable confirmed details into one cohesive narrative,
consolidating overlap and preserving useful original facts. It explains what was included or left
out, keeps lessons separate, and leaves the original untouched until **Save recommended update**.
You can optionally edit the recommendation. Changed source or preparation details require a fresh
recommendation before saving. Migration 015 persists these recommendations and their source snapshots.

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

## Events and agenda

Phase 2A adds **Agenda** under Jobs and **Events & next actions** in each application workspace.
Set **Display Time Zone** globally in Settings. Application contacts appear above Timeline;
use **Add Person** to open the create/link form.
Add interviews, screenings, assessments, deadlines, follow-ups, or agreed response dates;
use Date only for items without a meeting time. Events support linked contacts, rescheduling,
completion, cancellation, and history. The agenda displays overdue scheduled items after downtime.
See [PHASE_2A_PLAN.md](PHASE_2A_PLAN.md) for timezone and deletion behavior.
Run `npm run test:phase2a` for isolated event checks.

## Follow-up suggestions

**Needs attention** under Jobs lists explicit due actions and applications past your follow-up
threshold. Edit follow-up thresholds and timezone in Settings under Follow-up Rules. Each application workspace also shows
its suggestions. Record a follow-up, snooze until a date, dismiss the current reason, or close
the application. Snoozes and dismissals survive restart; muted items can be restored.
See [PHASE_2B_PLAN.md](PHASE_2B_PLAN.md) for rule precedence and activity-cycle behavior.
Run `npm run test:phase2b` for isolated checks.

## License

[MIT](LICENSE)
