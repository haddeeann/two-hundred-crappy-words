import { describe, expect, it, vi } from "vitest";
import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  planCreateMissingManuscriptSource,
  planLocateMissingManuscriptSource,
  planRemoveMissingManuscriptScene,
} from "./source-resolution";
import { executeManuscriptSourceResolution } from "./source-resolution-execution";
import { parseManuscriptStructure } from "./structure";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SCENE_ID = "b94fc398-9156-46d2-a48b-93e3c40ee638";

function projectFromText(
  text: string,
  state: "missing" | "ready" = "missing",
  readyText = "",
): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind !== "valid") throw new Error("fixture");
  const chapter = parsed.structure.manuscripts[0]!.items[0]!;
  if (chapter.kind !== "chapter") throw new Error("fixture");
  const scene = chapter.children[0];
  const source = scene?.source.path ?? "Manuscript/lost.md";
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
          children: scene ? [{
            item: scene,
            source: state === "ready"
              ? {
                  kind: "ready",
                  declaredPath: source,
                  resolvedPath: source,
                  bytes: new TextEncoder().encode(readyText).byteLength,
                  fingerprint: fingerprintContent(readyText),
                  wordCount: 0,
                }
              : {
                  kind: "missing",
                  declaredPath: source,
                  message: "missing",
                },
          }] : [],
        }],
      }],
    },
  };
}

function missingProject(): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  return projectFromText(`${JSON.stringify({
    formatVersion: 1,
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
          source: { path: "Manuscript/lost.md" },
        }],
      }],
    }],
  }, null, 2)}\n`);
}

describe("missing manuscript source resolution execution", () => {
  it("freshly verifies a located source before one atomic structure replacement", async () => {
    const initial = missingProject();
    const selectedText = "Recovered prose.\n";
    const plan = planLocateMissingManuscriptSource(
      initial,
      SCENE_ID,
      "Recovered/transmission.md",
      selectedText,
    );
    if (plan.kind !== "locate") throw new Error("fixture");
    const after = projectFromText(plan.updatedText, "ready", selectedText);
    const reload = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(after);
    const replaceAtomic = vi.fn().mockResolvedValue(undefined);

    const result = await executeManuscriptSourceResolution(plan, {
      reload,
      replaceAtomic,
      readVerifiedSource: vi.fn().mockResolvedValue(selectedText),
      createSource: vi.fn(),
    });

    expect(result).toMatchObject({
      kind: "success",
      undo: { label: "Undo located source for Lost transmission" },
    });
    expect(replaceAtomic).toHaveBeenCalledWith(initial.text, plan.updatedText);
  });

  it("refuses a located source that changed after preview", async () => {
    const initial = missingProject();
    const plan = planLocateMissingManuscriptSource(
      initial,
      SCENE_ID,
      "Recovered/transmission.md",
      "Previewed.\n",
    );
    if (plan.kind !== "locate") throw new Error("fixture");
    const replaceAtomic = vi.fn();
    const result = await executeManuscriptSourceResolution(plan, {
      reload: vi.fn().mockResolvedValue(initial),
      replaceAtomic,
      readVerifiedSource: vi.fn().mockResolvedValue("Changed.\n"),
      createSource: vi.fn(),
    });
    expect(result).toMatchObject({ kind: "failed" });
    expect(replaceAtomic).not.toHaveBeenCalled();
  });

  it("creates only the missing path and verifies its exact binding", async () => {
    const initial = missingProject();
    const plan = planCreateMissingManuscriptSource(initial, SCENE_ID);
    if (plan.kind !== "create") throw new Error("fixture");
    const after = projectFromText(initial.text, "ready", plan.sourceText);
    const createSource = vi.fn().mockResolvedValue(undefined);
    const result = await executeManuscriptSourceResolution(plan, {
      reload: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(after),
      replaceAtomic: vi.fn(),
      readVerifiedSource: vi.fn(),
      createSource,
    });
    expect(result).toMatchObject({ kind: "success", undo: null });
    expect(createSource).toHaveBeenCalledWith("Manuscript/lost.md", "");
  });

  it("removes only through an exact atomic structure replacement", async () => {
    const initial = missingProject();
    const plan = planRemoveMissingManuscriptScene(initial, SCENE_ID);
    if (plan.kind !== "remove") throw new Error("fixture");
    const after = projectFromText(plan.updatedText);
    const replaceAtomic = vi.fn().mockResolvedValue(undefined);
    const result = await executeManuscriptSourceResolution(plan, {
      reload: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(after),
      replaceAtomic,
      readVerifiedSource: vi.fn(),
      createSource: vi.fn(),
    });
    expect(result).toMatchObject({
      kind: "success",
      undo: { label: "Undo removal of Lost transmission" },
    });
    expect(replaceAtomic).toHaveBeenCalledOnce();
  });
});
