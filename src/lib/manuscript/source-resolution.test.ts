import { describe, expect, it } from "vitest";
import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  planCreateMissingManuscriptSource,
  planLocateMissingManuscriptSource,
  planRemoveMissingManuscriptScene,
} from "./source-resolution";
import { parseManuscriptStructure } from "./structure";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SCENE_ID = "b94fc398-9156-46d2-a48b-93e3c40ee638";

function missingProject(noteId?: string): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  const source = {
    formatVersion: 1,
    unknownRoot: "preserve me",
    manuscripts: [{
      id: MANUSCRIPT_ID,
      title: "The Patient Comet",
      items: [{
        id: CHAPTER_ID,
        kind: "chapter",
        title: "Signals",
        children: [{
          id: SCENE_ID,
          kind: "scene",
          title: "Lost transmission",
          source: {
            path: "Manuscript/lost.md",
            ...(noteId ? { noteId } : {}),
          },
          includeInCompile: true,
          unknownScene: { color: "amber" },
        }],
      }],
    }],
  };
  const text = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind !== "valid") throw new Error("fixture");
  const chapter = parsed.structure.manuscripts[0]!.items[0]!;
  if (chapter.kind !== "chapter") throw new Error("fixture");
  return {
    kind: "ready",
    text,
    fingerprint: fingerprintContent(text),
    source: parsed.source,
    reconciled: {
      structure: parsed.structure,
      acceptedSourceBytes: 0,
      readSourceBytes: 0,
      manuscripts: [{
        manuscript: parsed.structure.manuscripts[0]!,
        items: [{
          item: chapter,
          folder: null,
          overview: null,
          source: null,
          children: [{
            item: chapter.children[0]!,
            source: {
              kind: "missing",
              declaredPath: "Manuscript/lost.md",
              message: "The recorded Markdown source is missing.",
            },
          }],
        }],
      }],
    },
  };
}

describe("missing manuscript source resolution planning", () => {
  it("previews an exact path-only Locate without losing unknown fields", () => {
    const result = planLocateMissingManuscriptSource(
      missingProject(),
      SCENE_ID,
      "Recovered/transmission.md",
      "Recovered prose.\n",
    );
    expect(result).toMatchObject({
      kind: "locate",
      selectedPath: "Recovered/transmission.md",
      selectedBytes: 17,
      target: {
        itemTitle: "Lost transmission",
        declaredPath: "Manuscript/lost.md",
        jsonPath: "$.manuscripts[0].items[0].children[0]",
      },
    });
    if (result.kind !== "locate") throw new Error("fixture");
    const updated = JSON.parse(result.updatedText);
    expect(updated.manuscripts[0].items[0].children[0].source.path).toBe("Recovered/transmission.md");
    expect(updated.manuscripts[0].items[0].children[0].unknownScene).toEqual({ color: "amber" });
    expect(updated.unknownRoot).toBe("preserve me");
  });

  it("reserves Locate for path-only bindings and creates identity metadata when needed", () => {
    const noteId = "07aad09d-09d2-4dd1-9236-28bf4ec07d38";
    expect(
      planLocateMissingManuscriptSource(
        missingProject(noteId),
        SCENE_ID,
        "Recovered/transmission.md",
        "Recovered prose.\n",
      ),
    ).toMatchObject({ kind: "unavailable" });
    expect(planCreateMissingManuscriptSource(missingProject(noteId), SCENE_ID)).toMatchObject({
      kind: "create",
      sourceText: `---\nid: "${noteId}"\n---\n\n`,
    });
    expect(planCreateMissingManuscriptSource(missingProject(), SCENE_ID)).toMatchObject({
      kind: "create",
      sourceText: "",
    });
  });

  it("removes only the unavailable scene entry and never proposes deleting prose", () => {
    const result = planRemoveMissingManuscriptScene(missingProject(), SCENE_ID);
    expect(result).toMatchObject({
      kind: "remove",
      target: { itemKind: "scene", itemTitle: "Lost transmission" },
    });
    if (result.kind !== "remove") throw new Error("fixture");
    const updated = JSON.parse(result.updatedText);
    expect(updated.manuscripts[0].items[0].children).toEqual([]);
    expect(updated.unknownRoot).toBe("preserve me");
  });
});
