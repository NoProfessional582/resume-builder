import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listEvents, saveEvent } from '../resume/events.ts';
const params = z.object({id:z.coerce.number().int().positive(),eventId:z.coerce.number().int().positive().optional()});
export async function eventRoutes(app: FastifyInstance) {
 app.get('/events', async () => listEvents());
 app.get('/applications/:id/events', async req => listEvents(params.parse(req.params).id));
 app.post('/applications/:id/events', async req => saveEvent(params.parse(req.params).id,req.body));
 app.put('/applications/:id/events/:eventId', async req => { const p=params.parse(req.params); return saveEvent(p.id,req.body,p.eventId); });
}
