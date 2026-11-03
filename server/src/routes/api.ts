import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCodexStatus } from '../agent/codexCli.ts';
import { getRun, getRunEvents, isFinal, listRuns, runner, type RunStreamEvent } from '../agent/runner.ts';
import { pingTask } from '../agent/tasks/ping.ts';
import { getSettings, updateSettings } from '../settings.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, pid: process.pid, uptimeSeconds: Math.round(process.uptime()) }));

  // Settings
  app.get('/settings', async () => getSettings());
  app.put('/settings', async (req) => updateSettings(req.body));

  // Codex
  app.get('/codex/status', async () => getCodexStatus(getSettings().codexPath));
  app.post('/codex/test', async () => ({ runId: runner.enqueue(pingTask, {}) }));

  // Agent runs
  app.get('/runs', async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    // The list view doesn't need the large fields.
    return listRuns(limit).map(({ prompt, input, ...rest }) => rest);
  });

  app.get('/runs/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const run = getRun(id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return { ...run, events: getRunEvents(id) };
  });

  app.post('/runs/:id/cancel', async (req) => {
    const { id } = idParams.parse(req.params);
    return { cancelled: runner.cancel(id) };
  });

  // Live progress for one run, as Server-Sent Events. Ends when the run finishes.
  app.get('/runs/:id/stream', (req, reply) => {
    const { id } = idParams.parse(req.params);
    const run = getRun(id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (event: RunStreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    send({ kind: 'run', run });
    if (isFinal(run.status)) return res.end();

    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    const unsubscribe = runner.subscribe(id, (event) => {
      send(event);
      if (event.kind === 'run' && isFinal(event.run.status)) close();
    });
    function close() {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    }
    req.raw.on('close', close);
  });
}
