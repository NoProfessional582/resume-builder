import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.ts';
import { addActivity, changeStage, contacts, requireApplication, saveContact, workspace } from '../resume/workspace.ts';
const ids = z.object({
  id: z.coerce.number().int().positive(),
  child: z.coerce.number().int().positive().optional(),
});
export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/applications/:id/workspace', async (req) => workspace(ids.parse(req.params).id));
  app.post('/applications/:id/stage', async (req) => changeStage(ids.parse(req.params).id, req.body));
  app.post('/applications/:id/activity', async (req) => addActivity(ids.parse(req.params).id, req.body));
  app.delete('/applications/:id/activity/:child', async (req) => {
    const { id, child } = ids.parse(req.params);
    requireApplication(id);
    db.prepare('UPDATE application_activity SET voided=1 WHERE application_id=? AND id=?').run(id, child!);
    return workspace(id);
  });
  app.get('/contacts', async () => contacts());
  app.post('/contacts', async (req) => ({ id: saveContact(req.body) }));
  app.put('/contacts/:id', async (req) => ({
    id: saveContact(req.body, ids.parse(req.params).id),
  }));
  app.delete('/contacts/:id', async (req) => {
    z.object({ confirm: z.literal(true) }).parse(req.body);
    db.prepare('DELETE FROM contact WHERE id=?').run(ids.parse(req.params).id);
    return { ok: true };
  });
  app.put('/applications/:id/contacts/:child', async (req) => {
    const { id, child } = ids.parse(req.params);
    requireApplication(id);
    const { role } = z.object({ role: z.string().trim().max(200) }).parse(req.body);
    db.prepare(
      'INSERT INTO application_contact(application_id,contact_id,role) VALUES(?,?,?) ON CONFLICT(application_id,contact_id) DO UPDATE SET role=excluded.role',
    ).run(id, child!, role);
    return workspace(id);
  });
  app.delete('/applications/:id/contacts/:child', async (req) => {
    const { id, child } = ids.parse(req.params);
    requireApplication(id);
    db.prepare('DELETE FROM application_contact WHERE application_id=? AND contact_id=?').run(id, child!);
    return workspace(id);
  });
  app.get('/workspace-preferences', async () => {
    const row = db.prepare('SELECT data FROM workspace_preferences WHERE id=1').get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  });
  app.put('/workspace-preferences', async (req) => {
    const data = z
      .object({
        view: z.enum(['list', 'board']),
        search: z.string(),
        companies: z.array(z.string()),
        visible: z.array(z.string()),
        group: z.boolean(),
        sort: z.enum(['activity', 'added', 'title', 'company']),
        ascending: z.boolean(),
      })
      .parse(req.body);
    db.prepare(
      'INSERT INTO workspace_preferences(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
    ).run(JSON.stringify(data));
    return data;
  });
}
