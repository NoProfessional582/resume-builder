import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { runner } from './agent/runner.ts';
import { config } from './config.ts';
import { migrate } from './db.ts';
import { apiRoutes } from './routes/api.ts';

migrate();
runner.recoverInterrupted();

// 'warn' keeps per-request logs out of data/logs; errors still get logged.
const app = Fastify({ logger: { level: 'warn' } });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.code(status).send({ error: (err as Error).message });
});

await app.register(apiRoutes, { prefix: '/api' });

// Serve the built web app (npm run build). In development Vite serves it instead.
const hasWebBuild = existsSync(config.webDist);
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
}
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/') || !hasWebBuild || req.method !== 'GET') {
    return reply.code(404).send({ error: 'Not found' });
  }
  return reply.sendFile('index.html'); // client-side routing
});

await app.listen({ host: config.host, port: config.port });
writeFileSync(config.pidFile, String(process.pid));
console.log(`Resume Builder running at http://${config.host}:${config.port} (pid ${process.pid})`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);
  runner.shutdown();
  await app.close();
  rmSync(config.pidFile, { force: true });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
