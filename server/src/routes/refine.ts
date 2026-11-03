import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { acceptDraft, discardSession, getSession, retryTurn, sendMessage, startOrResume } from '../resume/refine.ts';
import { storyText } from '../resume/positions.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function refineRoutes(app: FastifyInstance): Promise<void> {
  // Opens (or resumes) the refinement chat for a story.
  app.post('/stories/:id/refine', async (req) => startOrResume(idParams.parse(req.params).id));

  app.get('/refine/:id', async (req) => getSession(idParams.parse(req.params).id));

  app.post('/refine/:id/messages', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        content: z.string().trim().min(1, 'Write an answer first').max(10000),
        draft: z.string().nullable().optional(),
        lessons: z.string().max(10000).nullable().optional(),
      })
      .parse(req.body);
    return sendMessage(id, body.content, body.draft ?? null, body.lessons ?? null);
  });

  app.post('/refine/:id/retry', async (req) => retryTurn(idParams.parse(req.params).id));

  app.post('/refine/:id/accept', async (req) => {
    const { id } = idParams.parse(req.params);
    const { draft, lessons } = z
      .object({ draft: storyText, lessons: z.string().max(10000).nullable().optional() })
      .parse(req.body);
    return acceptDraft(id, draft, lessons ?? null);
  });

  app.post('/refine/:id/discard', async (req) => discardSession(idParams.parse(req.params).id));
}
