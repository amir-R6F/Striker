export const ROADMAP_SCHEMA_VERSION = 1 as const;

export type RoadmapSource = "manual" | "ai" | "imported";

/**
 * Resources are stored exactly as supplied so import/export round-trips are
 * lossless. New roadmaps use `{ type, label?, url? }`; Legacy Full Striker
 * files that use `{ title, url }` remain importable.
 */
export interface RoadmapResource {
  type?: string;
  label?: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface RoadmapNodeJson {
  id: string;
  title: string;
  description: string;
  parent_id: string | null;
  order: number;
  tags: string[];
  estimated_hours: number;
  resources: RoadmapResource[];
  children: string[];
}

export interface RoadmapJson {
  schema_version: typeof ROADMAP_SCHEMA_VERSION;
  title: string;
  description: string;
  source: RoadmapSource;
  created_at: string;
  nodes: RoadmapNodeJson[];
}

export interface ParsedRoadmapNode {
  id: string;
  title: string;
  description: string;
  parent_id: string | null;
  order: number;
  tags: string[];
  estimated_hours: number;
  resources: RoadmapResource[];
}

export interface ParsedRoadmap {
  title: string;
  description: string;
  source: RoadmapSource;
  createdAt: string;
  nodes: ParsedRoadmapNode[];
}

export interface BuildRoadmapInput {
  title: string;
  description: string;
  source: RoadmapSource;
  createdAt: string;
  nodes: Array<{
    id: string;
    title: string;
    description: string;
    parent_id: string | null;
    order: number;
    estimated_hours: number;
    tags?: string[];
    resources?: RoadmapResource[];
  }>;
}

export class RoadmapValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors[0] ?? "The roadmap is not valid.");
    this.name = "RoadmapValidationError";
    this.errors = errors;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateTags(
  value: unknown,
  label: string,
  errors: string[],
): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} has invalid tags; expected an array of strings.`);
    return [];
  }
  if (value.some((tag) => typeof tag !== "string")) {
    errors.push(`${label} has invalid tags; every tag must be a string.`);
  }
  return value.filter((tag): tag is string => typeof tag === "string");
}

function validateResources(
  value: unknown,
  label: string,
  errors: string[],
): RoadmapResource[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(
      `${label} has invalid resources; expected an array of objects.`,
    );
    return [];
  }

  const resources: RoadmapResource[] = [];
  value.forEach((item, index) => {
    const itemLabel = `${label} resource ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${itemLabel} must be an object.`);
      return;
    }
    const record = item as Record<string, unknown>;
    const type =
      typeof record.type === "string" ? record.type.trim() : "";
    const legacyTitle =
      typeof record.title === "string" ? record.title.trim() : "";
    if (!type && !legacyTitle) {
      errors.push(`${itemLabel} must have a string "type".`);
      return;
    }
    if (record.url != null && typeof record.url !== "string") {
      errors.push(`${itemLabel} has an invalid "url"; expected a string.`);
      return;
    }
    if (record.label != null && typeof record.label !== "string") {
      errors.push(`${itemLabel} has an invalid "label"; expected a string.`);
      return;
    }
    // Preserve the object as-is, including optional fields, so exports are
    // lossless. Validation above only checks the required shape.
    resources.push(record as RoadmapResource);
  });
  return resources;
}

/**
 * Strictly validates the shared v1 schema: unique ids, valid parents, no
 * cycles and children arrays that match parent_id in both directions.
 */
export function parseRoadmap(input: string): ParsedRoadmap {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    throw new RoadmapValidationError(["The text is not valid JSON."]);
  }

  const root = asRecord(raw);
  if (!root) {
    throw new RoadmapValidationError(["The roadmap must be a JSON object."]);
  }

  const errors: string[] = [];
  if (root.schema_version !== ROADMAP_SCHEMA_VERSION) {
    errors.push("schema_version must be 1.");
  }
  const title =
    typeof root.title === "string" && root.title.trim()
      ? root.title.trim()
      : "";
  if (!title) errors.push("title must be a non-empty string.");
  const description =
    typeof root.description === "string" ? root.description.trim() : "";
  const rawSource = root.source;
  if (
    rawSource !== "manual" &&
    rawSource !== "ai" &&
    rawSource !== "imported"
  ) {
    errors.push('source must be "manual", "ai" or "imported".');
  }
  const source: RoadmapSource =
    rawSource === "manual" || rawSource === "ai" || rawSource === "imported"
      ? rawSource
      : "imported";
  const createdAt =
    typeof root.created_at === "string" && root.created_at.trim()
      ? root.created_at.trim()
      : new Date().toISOString();

  if (!Array.isArray(root.nodes)) {
    errors.push("nodes must be an array.");
    throw new RoadmapValidationError(errors);
  }

  const nodes: ParsedRoadmapNode[] = [];
  const childrenById = new Map<string, string[]>();
  const ids = new Set<string>();

  root.nodes.forEach((value, index) => {
    const node = asRecord(value);
    const label = `Node ${index + 1}`;
    if (!node) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const id = typeof node.id === "string" ? node.id.trim() : "";
    if (!id) {
      errors.push(`${label} is missing a string id.`);
      return;
    }
    if (ids.has(id)) {
      errors.push(`Duplicate node id "${id}".`);
      return;
    }
    ids.add(id);

    const nodeTitle =
      typeof node.title === "string" ? node.title.trim() : "";
    if (!nodeTitle) errors.push(`${label} (${id}) is missing a title.`);

    const parentId =
      node.parent_id == null || node.parent_id === ""
        ? null
        : typeof node.parent_id === "string"
          ? node.parent_id.trim()
          : null;
    if (node.parent_id != null && typeof node.parent_id !== "string") {
      errors.push(`${label} (${id}) has an invalid parent_id.`);
    }

    const orderValue =
      typeof node.order === "number" && Number.isFinite(node.order)
        ? Math.max(0, Math.round(node.order))
        : index + 1;
    const estimated =
      typeof node.estimated_hours === "number" &&
      Number.isFinite(node.estimated_hours)
        ? Math.max(0, node.estimated_hours)
        : 0;

    const resources = validateResources(
      node.resources,
      `${label} (${id})`,
      errors,
    );
    const tags = validateTags(node.tags, `${label} (${id})`, errors);

    const childValues = stringArray(node.children);
    if (node.children != null && !Array.isArray(node.children)) {
      errors.push(`${label} (${id}) has an invalid children list.`);
    }
    childrenById.set(id, childValues);

    nodes.push({
      id,
      title: nodeTitle,
      description:
        typeof node.description === "string" ? node.description.trim() : "",
      parent_id: parentId,
      order: orderValue,
      tags,
      estimated_hours: estimated,
      resources,
    });
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parent_id && !byId.has(node.parent_id)) {
      errors.push(
        `Node "${node.id}" references missing parent "${node.parent_id}".`,
      );
    }
    if (node.parent_id === node.id) {
      errors.push(`Node "${node.id}" cannot be its own parent.`);
    }
  }

  // Walk parent chains to catch cycles.
  for (const node of nodes) {
    const seen = new Set<string>([node.id]);
    let cursor = node.parent_id;
    while (cursor) {
      if (seen.has(cursor)) {
        errors.push(`Cycle detected at node "${node.id}".`);
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.parent_id ?? null;
    }
  }

  // children must be the inverse of parent_id, with no duplicates.
  const expectedChildren = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const children = expectedChildren.get(node.parent_id) ?? new Set<string>();
    children.add(node.id);
    expectedChildren.set(node.parent_id, children);
  }
  for (const node of nodes) {
    const listed = childrenById.get(node.id) ?? [];
    if (new Set(listed).size !== listed.length) {
      errors.push(`Node "${node.id}" lists a child more than once.`);
    }
    const expected = expectedChildren.get(node.id) ?? new Set<string>();
    for (const child of listed) {
      if (!byId.has(child)) {
        errors.push(`Node "${node.id}" lists missing child "${child}".`);
      } else if (byId.get(child)?.parent_id !== node.id) {
        errors.push(
          `Node "${node.id}" lists "${child}", but that child's parent_id differs.`,
        );
      }
    }
    for (const child of expected) {
      if (!listed.includes(child)) {
        errors.push(`Node "${child}" is missing from "${node.id}" children.`);
      }
    }
  }

  if (errors.length > 0) throw new RoadmapValidationError(errors);

  return { title, description, source, createdAt, nodes };
}

/** Exports Mini nodes in the shared schema-v1 shape Full accepts. */
export function buildRoadmap(input: BuildRoadmapInput): RoadmapJson {
  const ordered = [...input.nodes].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
  const childrenById = new Map<string, string[]>();
  for (const node of input.nodes) {
    if (!node.parent_id) continue;
    const list = childrenById.get(node.parent_id) ?? [];
    list.push(node.id);
    childrenById.set(node.parent_id, list);
  }
  const orderById = new Map(input.nodes.map((node) => [node.id, node.order]));
  for (const list of childrenById.values()) {
    list.sort(
      (a, b) =>
        (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0) ||
        a.localeCompare(b),
    );
  }

  return {
    schema_version: ROADMAP_SCHEMA_VERSION,
    title: input.title,
    description: input.description,
    source: input.source,
    created_at: input.createdAt,
    nodes: ordered.map((node) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      parent_id: node.parent_id,
      order: node.order,
      tags: node.tags ?? [],
      estimated_hours: node.estimated_hours,
      resources: node.resources ?? [],
      children: childrenById.get(node.id) ?? [],
    })),
  };
}

export function roadmapFileName(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "skill-tree";
  return `${slug}-roadmap.json`;
}

export function roadmapPromptTemplate(): string {
  return `Create a learning roadmap as valid JSON only, using this exact schema version 1.

Schema:
{
  "schema_version": 1,
  "title": "Roadmap title",
  "description": "Short description",
  "source": "ai",
  "created_at": "2026-01-01T00:00:00.000Z",
  "nodes": [
    {
      "id": "unique-string-id",
      "title": "Node title",
      "description": "What to learn or build",
      "parent_id": null,
      "order": 1,
      "tags": ["tag"],
      "estimated_hours": 4,
      "resources": [{ "type": "article", "label": "Resource", "url": "https://example.com" }],
      "children": []
    }
  ]
}

Rules:
- Every node id is unique and stable (kebab-case is fine).
- parent_id is null for roots, otherwise it must match an existing node id.
- children must list exactly the ids whose parent_id is this node, and no others.
- No cycles. Parents must appear anywhere in the flat nodes array.
- order is the sibling order, starting at 1.
- source must be "ai".
- Return only the JSON object, no markdown fences or commentary.

Example:
{
  "schema_version": 1,
  "title": "Blender character art",
  "description": "A focused path from blocking to portfolio pieces.",
  "source": "ai",
  "created_at": "2026-01-01T00:00:00.000Z",
  "nodes": [
    {
      "id": "fundamentals",
      "title": "Fundamentals",
      "description": "Form, proportion and observation.",
      "parent_id": null,
      "order": 1,
      "tags": ["basics"],
      "estimated_hours": 10,
      "resources": [],
      "children": ["blocking"]
    },
    {
      "id": "blocking",
      "title": "Blocking",
      "description": "Build a readable primary silhouette.",
      "parent_id": "fundamentals",
      "order": 1,
      "tags": ["sculpting"],
      "estimated_hours": 8,
      "resources": [{ "type": "article", "label": "Reference", "url": "https://example.com" }],
      "children": []
    }
  ]
}`;
}
