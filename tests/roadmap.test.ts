import { describe, expect, it } from "vitest";
import {
  buildRoadmap,
  parseRoadmap,
  RoadmapValidationError,
  type RoadmapJson,
} from "../src/lib/roadmap";

function roadmap(
  nodes: RoadmapJson["nodes"],
  overrides: Partial<RoadmapJson> = {},
): RoadmapJson {
  return {
    schema_version: 1,
    title: "  Blender path  ",
    description: "  From blocking to lighting.  ",
    source: "imported",
    created_at: "2026-11-10T00:00:00.000Z",
    nodes,
    ...overrides,
  };
}

function node(
  id: string,
  overrides: Partial<RoadmapJson["nodes"][number]> = {},
): RoadmapJson["nodes"][number] {
  return {
    id,
    title: id,
    description: "",
    parent_id: null,
    order: 1,
    tags: [],
    estimated_hours: 1,
    resources: [],
    children: [],
    ...overrides,
  };
}

function errorsFor(value: unknown): string[] {
  try {
    parseRoadmap(typeof value === "string" ? value : JSON.stringify(value));
  } catch (error) {
    if (error instanceof RoadmapValidationError) return error.errors;
    throw error;
  }
  return [];
}

describe("parseRoadmap", () => {
  it("parses a valid nested roadmap and preserves tags/resources", () => {
    const parsed = parseRoadmap(
      JSON.stringify(
        roadmap([
          node("modeling", {
            title: " Modeling ",
            estimated_hours: 10,
            order: 1,
            children: ["bevel"],
          }),
          node("bevel", {
            parent_id: "modeling",
            estimated_hours: 2,
            tags: [" mesh ", ""],
            resources: [
              {
                type: "article",
                label: " Guide ",
                url: " https://example.com ",
              },
            ],
          }),
        ]),
      ),
    );

    expect(parsed.title).toBe("Blender path");
    expect(parsed.description).toBe("From blocking to lighting.");
    expect(parsed.source).toBe("imported");
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[1]).toMatchObject({
      id: "bevel",
      parent_id: "modeling",
      tags: [" mesh ", ""],
      resources: [
        {
          type: "article",
          label: " Guide ",
          url: " https://example.com ",
        },
      ],
    });
  });

  it("rejects malformed JSON and non-object roots", () => {
    expect(errorsFor("{nope")).toEqual(["The text is not valid JSON."]);
    expect(errorsFor("[]")).toEqual([
      "The roadmap must be a JSON object.",
    ]);
  });

  it("rejects unsupported schema versions and sources", () => {
    const errors = errorsFor(
      roadmap([], {
        schema_version: 2 as 1,
        title: " ",
        source: "other" as "imported",
        nodes: [],
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        "schema_version must be 1.",
        "title must be a non-empty string.",
        'source must be "manual", "ai" or "imported".',
      ]),
    );
    expect(errors).toHaveLength(3);
  });

  it("rejects non-array tags and malformed resources", () => {
    const invalidTags = errorsFor(
      roadmap([node("bad", { tags: "mesh" as unknown as string[] })]),
    );
    expect(invalidTags).toContain(
      'Node 1 (bad) has invalid tags; expected an array of strings.',
    );

    const nonStringTag = errorsFor(
      roadmap([node("bad", { tags: ["ok", 3] as unknown as string[] })]),
    );
    expect(nonStringTag).toContain(
      "Node 1 (bad) has invalid tags; every tag must be a string.",
    );

    const nonArrayResources = errorsFor(
      roadmap([
        node("bad", {
          resources: "https://example.com" as unknown as RoadmapJson["nodes"][number]["resources"],
        }),
      ]),
    );
    expect(nonArrayResources).toContain(
      "Node 1 (bad) has invalid resources; expected an array of objects.",
    );

    const missingType = errorsFor(
      roadmap([
        node("bad", {
          resources: [{ url: "https://example.com" }],
        }),
      ]),
    );
    expect(missingType).toContain(
      'Node 1 (bad) resource 1 must have a string "type".',
    );

    const invalidUrl = errorsFor(
      roadmap([
        node("bad", {
          resources: [
            {
              type: "article",
              url: 42,
            } as unknown as RoadmapJson["nodes"][number]["resources"][number],
          ],
        }),
      ]),
    );
    expect(invalidUrl).toContain(
      'Node 1 (bad) resource 1 has an invalid "url"; expected a string.',
    );
  });

  it("rejects duplicate ids", () => {
    const errors = errorsFor(roadmap([node("bevel"), node("bevel")]));
    expect(errors.some((error) => error.includes("Duplicate node id"))).toBe(
      true,
    );
  });

  it("rejects missing parents, self-parents, and cycles", () => {
    const missing = errorsFor(
      roadmap([node("bevel", { parent_id: "ghost" })]),
    );
    expect(missing).toContain(
      'Node "bevel" references missing parent "ghost".',
    );

    const self = errorsFor(roadmap([node("bevel", { parent_id: "bevel" })]));
    expect(self).toContain('Node "bevel" cannot be its own parent.');

    const cycle = errorsFor(
      roadmap([
        node("a", { parent_id: "b", children: ["b"] }),
        node("b", { parent_id: "a", children: ["a"] }),
      ]),
    );
    expect(cycle.some((error) => error.includes("Cycle detected"))).toBe(true);
  });

  it("rejects children that do not match parent_id", () => {
    const missingChild = errorsFor(
      roadmap([
        node("modeling", { children: [] }),
        node("bevel", { parent_id: "modeling" }),
      ]),
    );
    expect(missingChild).toContain(
      'Node "bevel" is missing from "modeling" children.',
    );

    const wrongParent = errorsFor(
      roadmap([
        node("modeling", { parent_id: "other", children: ["bevel"] }),
        node("other", { children: ["modeling"] }),
        node("bevel"),
      ]),
    );
    expect(wrongParent).toEqual([
      'Node "modeling" lists "bevel", but that child\'s parent_id differs.',
    ]);

    const duplicateChild = errorsFor(
      roadmap([
        node("modeling", { children: ["bevel", "bevel"] }),
        node("bevel", { parent_id: "modeling" }),
      ]),
    );
    expect(duplicateChild).toContain(
      'Node "modeling" lists a child more than once.',
    );

    const ghostChild = errorsFor(
      roadmap([node("modeling", { children: ["ghost"] })]),
    );
    expect(ghostChild).toContain(
      'Node "modeling" lists missing child "ghost".',
    );
  });

  it("round-trips tags and resources losslessly through build and parse", () => {
    const tags = ["blender", "lighting", "", " spaced "];
    const resources = [
      {
        type: "video",
        label: "Lighting guide",
        url: "https://example.com/lighting",
      },
      { type: "note", label: "Watch twice" },
    ];
    const source = parseRoadmap(
      JSON.stringify(
        roadmap([
          node("lighting", {
            tags,
            resources,
            children: [],
          }),
        ]),
      ),
    );

    const built = buildRoadmap({
      title: source.title,
      description: source.description,
      source: source.source,
      createdAt: source.createdAt,
      nodes: source.nodes,
    });
    const reparsed = parseRoadmap(JSON.stringify(built));

    expect(reparsed.nodes[0].tags).toEqual(tags);
    expect(reparsed.nodes[0].resources).toEqual(resources);
  });

  it("round-trips a built roadmap through validation", () => {
    const built = buildRoadmap({
      title: "Lighting",
      description: "",
      source: "manual",
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "lighting",
          title: "Lighting",
          description: "",
          parent_id: null,
          order: 1,
          estimated_hours: 4,
        },
        {
          id: "three-point",
          title: "Three point",
          description: "",
          parent_id: "lighting",
          order: 2,
          estimated_hours: 1.5,
        },
        {
          id: "rim",
          title: "Rim",
          description: "",
          parent_id: "lighting",
          order: 1,
          estimated_hours: 0.5,
        },
      ],
    });

    expect(built.nodes.find((item) => item.id === "lighting")?.children).toEqual(
      ["rim", "three-point"],
    );
    expect(built.nodes.every((item) => item.tags.length === 0)).toBe(true);
    expect(built.nodes.every((item) => item.resources.length === 0)).toBe(true);
    expect(parseRoadmap(JSON.stringify(built)).nodes).toHaveLength(3);
  });
});
