import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPosition,
  createStory,
  deletePosition,
  deleteStory,
  listPositions,
  listVersions,
  moveStory,
  positionInput,
  reorderStories,
  restoreVersion,
  storyText,
  updatePosition,
  updateStoryLessons,
  updateStoryText,
} from '../resume/positions.ts';
import { normalizeHeading } from '../resume/content.ts';
import { createSection, deleteSection, listSections, reorderSections, saveSection, sectionInput } from '../resume/sections.ts';
import { getActiveTemplate } from '../resume/template.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const idList = z.object({ ids: z.array(z.number().int().positive()) });

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // Positions and their stories
  app.get('/positions', async () => listPositions());

  app.post('/positions', async (req, reply) => {
    const id = createPosition(positionInput.parse(req.body));
    return reply.code(201).send(listPositions().find((p) => p.id === id));
  });

  app.put('/positions/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    updatePosition(id, positionInput.parse(req.body));
    return listPositions().find((p) => p.id === id);
  });

  app.delete('/positions/:id', async (req, reply) => {
    deletePosition(idParams.parse(req.params).id);
    return reply.code(204).send();
  });

  app.post('/positions/:id/stories', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { text } = z.object({ text: storyText }).parse(req.body);
    return reply.code(201).send(createStory(id, text));
  });

  app.put('/positions/:id/stories/order', async (req) => {
    const { id } = idParams.parse(req.params);
    reorderStories(id, idList.parse(req.body).ids);
    return { ok: true };
  });

  // Stories
  app.put('/stories/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        text: storyText.optional(),
        lessons: z.string().max(10000).nullable().optional(),
        positionId: z.number().int().positive().optional(),
      })
      .parse(req.body);
    if (body.positionId !== undefined) moveStory(id, body.positionId);
    if (body.lessons !== undefined) updateStoryLessons(id, body.lessons);
    if (body.text !== undefined) return updateStoryText(id, body.text);
    return listPositions().flatMap((p) => p.stories).find((s) => s.id === id);
  });

  app.delete('/stories/:id', async (req, reply) => {
    deleteStory(idParams.parse(req.params).id);
    return reply.code(204).send();
  });

  app.get('/stories/:id/versions', async (req) => listVersions(idParams.parse(req.params).id));

  app.post('/stories/:id/restore', async (req) => {
    const { id } = idParams.parse(req.params);
    const { versionId } = z.object({ versionId: z.number().int().positive() }).parse(req.body);
    return restoreVersion(id, versionId);
  });

  // Other sections. inTemplate: whether the active template has a place for it (else it won't print).
  app.get('/sections', async () => {
    const templateSections = getActiveTemplate()?.layout.sections ?? [];
    return listSections().map((s) => ({
      ...s,
      inTemplate: templateSections.some(
        (t) => t.kind === s.kind && (s.kind !== 'entries' || normalizeHeading(t.heading) === normalizeHeading(s.heading)),
      ),
    }));
  });

  app.post('/sections', async (req, reply) => {
    const id = createSection(sectionInput.parse(req.body));
    return reply.code(201).send(listSections().find((s) => s.id === id));
  });

  app.put('/sections/order', async (req) => {
    reorderSections(idList.parse(req.body).ids);
    return { ok: true };
  });

  app.put('/sections/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        heading: z
          .string()
          .trim()
          .nullable()
          .transform((v) => v || null),
        items: z.array(z.unknown()),
      })
      .parse(req.body);
    return saveSection(id, body.heading, body.items);
  });

  app.delete('/sections/:id', async (req, reply) => {
    deleteSection(idParams.parse(req.params).id);
    return reply.code(204).send();
  });
}
