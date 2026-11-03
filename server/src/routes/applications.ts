import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analyze,
  applicationInput,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  resetAnalysis,
  saveAnalysis,
  updateApplication,
} from '../resume/applications.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/applications', async () => listApplications());

  // Creating an application starts its analysis right away.
  app.post('/applications', async (req, reply) => reply.code(201).send(createApplication(applicationInput.parse(req.body))));

  app.get('/applications/:id', async (req) => getApplication(idParams.parse(req.params).id));

  app.put('/applications/:id', async (req) =>
    updateApplication(idParams.parse(req.params).id, applicationInput.parse(req.body)),
  );

  app.delete('/applications/:id', async (req, reply) => {
    deleteApplication(idParams.parse(req.params).id);
    return reply.code(204).send();
  });

  app.post('/applications/:id/analyze', async (req) => analyze(idParams.parse(req.params).id));

  app.put('/applications/:id/analysis', async (req) => saveAnalysis(idParams.parse(req.params).id, req.body));

  app.post('/applications/:id/analysis/reset', async (req) => resetAnalysis(idParams.parse(req.params).id));
}
