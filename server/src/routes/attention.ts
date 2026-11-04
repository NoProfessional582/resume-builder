import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { attentionAction, attentionList, attentionSettings, saveAttentionSettings } from '../resume/attention.ts';

export async function attentionRoutes(app: FastifyInstance) {
  app.get('/attention', async () => attentionList());
  app.get('/attention/settings', async () => attentionSettings());
  app.put('/attention/settings', async req => saveAttentionSettings(req.body));
  app.post('/applications/:id/attention', async req => {
    const {id} = z.object({id:z.coerce.number().int().positive()}).parse(req.params);
    return attentionAction(id,req.body);
  });
}
