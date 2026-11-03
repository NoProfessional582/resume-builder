import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { z } from 'zod';
import {
  deleteTailored,
  fitTailored,
  generateDocx,
  reviseTailored,
  getTailored,
  listTailored,
  resetTailoredContent,
  retryTailoring,
  saveTailoredContent,
  startTailoring,
  tailoredFile,
} from '../resume/tailoring.ts';
import { getReview, startReview } from '../resume/reviews.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function tailoringRoutes(app: FastifyInstance): Promise<void> {
  app.get('/applications/:id/tailored', async (req) => listTailored(idParams.parse(req.params).id));

  // Starts a new tailoring run (a new version).
  app.post('/applications/:id/tailored', async (req, reply) =>
    reply.code(201).send(startTailoring(idParams.parse(req.params).id, req.body)),
  );

  app.get('/tailored/:id', async (req) => getTailored(idParams.parse(req.params).id));
  app.put('/tailored/:id/content', async (req) => saveTailoredContent(idParams.parse(req.params).id, req.body));
  app.post('/tailored/:id/reset', async (req) => resetTailoredContent(idParams.parse(req.params).id));
  app.post('/tailored/:id/retry', async (req) => retryTailoring(idParams.parse(req.params).id));
  app.post('/tailored/:id/generate', async (req) => generateDocx(idParams.parse(req.params).id));

  // These two make a new version from this one.
  app.post('/tailored/:id/revise', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { instruction } = z
      .object({ instruction: z.string().trim().min(3, 'Say what to change').max(4000) })
      .parse(req.body);
    return reply.code(201).send(reviseTailored(id, instruction));
  });
  app.post('/tailored/:id/fit', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { targetPages } = z.object({ targetPages: z.number().int().min(1).max(3).optional() }).parse(req.body ?? {});
    return reply.code(201).send(fitTailored(id, targetPages));
  });

  // Recruiter / hiring-manager scoring of a version against its posting (null until scored).
  app.get('/tailored/:id/review', async (req) => getReview(idParams.parse(req.params).id));
  app.post('/tailored/:id/review', async (req, reply) => reply.code(202).send(startReview(idParams.parse(req.params).id)));

  app.delete('/tailored/:id', async (req, reply) => {
    deleteTailored(idParams.parse(req.params).id);
    return reply.code(204).send();
  });

  app.get('/tailored/:id/files/:kind', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { kind } = z.object({ kind: z.enum(['docx', 'pdf']) }).parse(req.params);
    const file = tailoredFile(id, kind);
    if (!existsSync(file.path)) return reply.code(404).send({ error: 'File not found' });
    reply.header('Cache-Control', 'no-store');
    // The PDF opens inline for the preview; the .docx downloads with a readable name.
    reply.header(
      'Content-Disposition',
      `${kind === 'pdf' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`,
    );
    return reply.type(kind === 'pdf' ? 'application/pdf' : DOCX_TYPE).send(createReadStream(file.path));
  });
}
