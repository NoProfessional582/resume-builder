import { z } from 'zod';

type JsonNode = { [key: string]: unknown };

/**
 * Converts a Zod schema to the JSON Schema dialect `codex exec --output-schema` accepts
 * (OpenAI strict mode): every object lists all of its properties as required and allows no extras.
 * Model optional fields with `.nullable()` instead of `.optional()`.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonNode {
  const json = z.toJSONSchema(schema, { io: 'output' }) as JsonNode;
  delete json.$schema;
  return strictify(json) as JsonNode;
}

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== 'object') return node;
  const out: JsonNode = {};
  for (const [key, value] of Object.entries(node)) out[key] = strictify(value);
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}
