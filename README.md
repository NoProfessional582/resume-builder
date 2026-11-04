# Resume Builder

Resume Builder is a local Windows app for managing your job search, developing your work-history
stories, and creating tailored résumés. Keep your experience in one place, analyze job postings,
and generate a `.docx` résumé using the formatting of your existing résumé.

The app runs on your PC and stores your data locally. AI features use the
[Codex CLI](https://github.com/openai/codex), signed in with your ChatGPT account.

## Features

### Build a reusable record of your experience

Import your existing `.docx` résumé to bring in your work history and other sections, and use its
formatting as the template for future résumés. Keep detailed stories under each position so you
have room to record the context, decisions, challenges, and outcomes that a short résumé leaves out.
This gives each new application a richer source of evidence to draw from.

Use **Refine with AI** on a story to develop it through conversation. The agent assesses context,
your personal actions, metrics, impact, results, and lessons learned as present, partial, or missing.
It asks up to three focused questions at a time, folds your answers into a draft, and explains what
changed. You can edit the draft yourself, compare it with the original, and accept or discard the
refinement. Lessons learned stay separate from the factual story for use in interview preparation.

**Why it helps:** a vague responsibility such as “supported a rollout” can hide your strongest
experience. Focused questions help recover what you owned, what made the work difficult, and what
changed as a result. Save those details once and reuse them across applications.

### Understand what a job posting is asking for

Add a job posting by pasting its text or a link. The analysis summarizes the role, its seniority,
and its technical, leadership, program, or customer emphasis. It organizes keywords by importance
and category, identifies the experience the employer wants demonstrated, and captures practical
requirements such as qualifications, location, or travel when the posting states them.

Keywords include supporting posting excerpts and alternate wording. Expected behavioral interview
questions explain the competency they test and why it matters for this role. You can review and
edit the analysis before using it to guide your résumé.

**Why it helps:** turn a long posting into a clearer set of priorities. See which requirements
need strong examples and which are preferences, so you can focus your résumé and preparation on
the evidence most relevant to the position.

### Create a tailored résumé from your actual experience

The tailoring agent uses your profile and work-history stories to write a role-specific summary,
select relevant skills, and develop bullets with the job's supported terminology. Each generated
bullet links to its source stories. Unsupported requirements appear as gaps with explanations.
The agent is instructed to use your profile as its factual source and flag gaps honestly.

Choose a target page count, bullet limits, whether to include role descriptions, and any additional
instructions. Review and edit the content, inspect the source stories, or request a revision in
plain language. Revisions and page-fitting actions create new versions, letting you return to
previous drafts. Your writing style guide controls the voice used by the agent.

The editor shows keyword coverage and checks for issues such as numbers absent from cited stories,
missing or mismatched sources, bullet counts, and phrases on your style guide's avoid list. Generate
the Word document, inspect its PDF preview, and download the `.docx`. Automatic fitting measures the
rendered document and attempts to trim it to your target length.

**Why it helps:** adapt the emphasis for each opportunity while keeping the evidence visible.
You can check why a bullet is there, spot unsupported wording, and review the actual page layout
before sending the résumé.

### Grade the résumé from recruiter and hiring-manager perspectives

Choose **Score this résumé** in **Recruiter review** to evaluate a saved résumé version against
the job posting. The agent takes the perspectives of a senior recruiter doing an initial screen
and a hiring manager assessing whether the experience demonstrates the scope of the role.

The review includes:

- An overall score out of 100, a short verdict, and an assessment of whether to advance, phone
  screen, hold, or reject the résumé.
- Scores out of 10 with specific comments for required qualifications, preferred qualifications,
  relevant experience, impact and results, seniority and scope, keywords (ATS), and clarity and presentation.
- Strengths tied to résumé evidence and posting requirements.
- Deficiencies ranked by severity, with an explanation of why each matters and a concrete suggested fix.
- Qualifications that are missing, partially demonstrated, or unclear, plus interview questions
  that probe weak points.

**Why it helps:** distinguish a presentation problem from an evidence gap. If you have the
experience but the résumé does not show it clearly, you have a specific revision to make. If the
experience is absent, you can recognize that gap and prepare to discuss it honestly.

After editing, save and score again; the app flags reviews when the résumé has changed since scoring.
Scores are AI assessments of the saved résumé against a particular posting. They are guidance for
revision, not an employer's decision or an actual ATS test.

### Prepare interview answers with a conversational coach

Open **Interview prep** to work from expected questions and agent-selected story matches. Each
match explains why the experience is relevant and which details to develop. The preparation plan
also identifies additional useful stories and requirements with no supporting story, helping you
choose where to spend your preparation time. Suggested questions are inferred from the posting;
they are not confirmed questions from the employer.

Choose **Prepare this story** to start a guided conversation. The coach first assesses how your
existing experience answers the question and asks for the most useful missing details. Your replies
help build a natural first-person answer using **Situation, Task, Action, Result, and Lessons learned
(S.T.A.R.L)**. The agent distinguishes your contribution from team outcomes, asks about unsupported
details, and produces speaking notes and likely follow-up questions. You can also edit manually,
keep practice notes, save drafts, and reopen preparation to continue later.

**Why it helps:** move from knowing you have a relevant example to explaining it clearly aloud.
The coaching develops ownership, decisions, outcomes, and reflection, giving you both a structured
answer and shorter notes for practice.

### Turn interview preparation into stronger future applications

Interview preparation often brings back details that were missing from the original work-history
story. Use **Recommend story update** for a separate agent review that integrates applicable,
user-confirmed facts into a cohesive replacement story and keeps lessons learned separate.

The recommendation explains its changes and which details it left out. Review the original and
proposed update, optionally edit the recommendation, and choose **Save recommended update** to
apply it. The interview answer remains separate from work history; preparing an answer does not
automatically replace the source story. Changed source or preparation details require a fresh
recommendation before saving.

**Why it helps:** the work you do preparing for one interview can strengthen the evidence available
for future résumé tailoring, without copying a rehearsed answer into your work history.

### Keep the job search organized

Track each application alongside its analysis, posting, résumé versions, and interview preparation.
Use List or Board view with saved search, filters, company grouping, sorting, and drag-and-drop
stage changes. Dated activity history and shared contacts help you keep track of conversations
and the people involved.

Use **Agenda** and each application's events and next actions for interviews, screenings,
assessments, deadlines, and follow-ups. Link contacts, reschedule events, and mark them complete or
cancelled in your chosen display timezone. **Needs attention** brings together due actions and
applications past your configurable follow-up thresholds, with options to record a follow-up,
snooze, dismiss, or close the application.

**Why it helps:** keep preparation and follow-through connected to the opportunity, so the next
step is easier to find when you are managing several applications at once.

Your work is stored locally, with on-demand database and template backups in Settings and automatic
backups at startup when the newest is more than a day old. See **Your data** below for details.

### Example: from a brief bullet to an application and interview story

This illustrative workflow shows how the features work together; the details come from the user.

1. **Recover the evidence.** Start with “Supported a customer rollout.” In **Refine with AI**, explain
   that you coordinated three teams, owned the readiness checklist, and resolved training gaps before
   launch. Add measured results if you have them; a factual qualitative outcome is also useful.
2. **Find the relevant angle.** Analyze a posting that emphasizes cross-functional delivery and
   customer adoption. Use its requirements and keyword evidence to understand why this rollout matters.
3. **Build and inspect the résumé.** Generate a tailored version that emphasizes the coordination
   and readiness work. Check the bullet against its source story, review coverage and warnings, and
   inspect the document preview.
4. **Use the review to prioritize revisions.** If the recruiter review says your ownership or results
   are unclear, clarify those details where supported, then save and score again.
5. **Prepare to explain the experience.** Match the story to a question about a difficult launch.
   Work with the coach on your decisions, actions, outcome, and lessons, then practice with speaking notes.
6. **Keep what you learned.** If the conversation surfaces additional confirmed facts, review a
   recommended story update so later applications can draw on the fuller account.


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
