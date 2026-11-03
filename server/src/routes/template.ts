import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { z } from 'zod';
import { ROLES } from '../docx/roles.ts';
import { buildPreview, createImport, getImportView, importFile, saveImport, setBlockOverride } from '../resume/imports.ts';
import { profileCounts } from '../resume/profile.ts';
import { getActiveTemplate, previewProfile } from '../resume/template.ts';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  // The upload is sent as the raw file body.
  for (const type of [DOCX_TYPE, 'application/octet-stream']) {
    app.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: 20 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  }

  app.post('/imports', async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Send the .docx file as the request body.' });
    const filename = decodeURIComponent(String(req.headers['x-filename'] ?? 'resume.docx'));
    if (!filename.toLowerCase().endsWith('.docx')) return reply.code(400).send({ error: 'Only .docx files are supported.' });
    try {
      return createImport(filename, req.body);
    } catch (err) {
      return reply.code((err as { statusCode?: number }).statusCode ?? 400).send({ error: (err as Error).message });
    }
  });

  app.get('/imports/:id', async (req) => getImportView(idParams.parse(req.params).id));

  app.put('/imports/:id/blocks/:index', async (req) => {
    const { id } = idParams.parse(req.params);
    const { index } = z.object({ index: z.coerce.number().int().min(0) }).parse(req.params);
    const change = z
      .object({ role: z.enum(ROLES).optional(), pattern: z.string().nullable().optional() })
      .parse(req.body);
    return setBlockOverride(id, index, change);
  });

  app.post('/imports/:id/preview', async (req) => buildPreview(idParams.parse(req.params).id));

  app.get('/imports/:id/files/:name', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { name } = z.object({ name: z.string() }).parse(req.params);
    const file = importFile(id, name);
    reply.header('Cache-Control', 'no-store');
    return reply.type(file.type).send(createReadStream(file.path));
  });

  app.post('/imports/:id/save', async (req) => {
    const { id } = idParams.parse(req.params);
    const { replaceContent } = z.object({ replaceContent: z.boolean() }).parse(req.body);
    return saveImport(id, replaceContent);
  });

  app.get('/template', async () => {
    const t = getActiveTemplate();
    if (!t) return { template: null, profile: profileCounts() };
    return {
      template: {
        id: t.id,
        importId: t.importId,
        filename: t.filename,
        createdAt: t.createdAt,
        dates: t.layout.dates,
        sections: t.layout.sections.map((s) => ({ kind: s.kind, heading: s.heading, roles: Object.keys(s.prototypes) })),
      },
      profile: profileCounts(),
    };
  });

  app.post('/template/preview', async (_req, reply) => {
    if (!getActiveTemplate()) return reply.code(409).send({ error: 'No template yet.' });
    const { pages } = await previewProfile();
    return { pages };
  });

  app.get('/template/preview/:name', async (req, reply) => {
    const { name } = z.object({ name: z.enum(['profile-preview.pdf', 'profile-preview.docx']) }).parse(req.params);
    const t = getActiveTemplate();
    const path = t ? `${t.filePath.replace(/template\.docx$/, '')}${name}` : null;
    if (!path || !existsSync(path)) return reply.code(404).send({ error: 'Not found' });
    reply.header('Cache-Control', 'no-store');
    return reply.type(name.endsWith('.pdf') ? 'application/pdf' : DOCX_TYPE).send(createReadStream(path));
  });
}
