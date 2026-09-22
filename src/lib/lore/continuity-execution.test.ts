import { describe, expect, it } from "vitest";

import { executeContinuityMutation, undoContinuityMutation } from "./continuity-execution";
import {
  planContinuityMutation,
  previewContinuityMutation,
  type ContinuityMutationRequest,
} from "./continuity-mutation";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";
const FACT_ID = "2e3120e7-0e74-4e3c-99a1-f2f76469559d";
const SOURCE = `---
id: "${NOTE_ID}"
facts:
  - id: "${FACT_ID}"
    property: "species"
    value:
      kind: "text"
      text: "Human"
---
Body
`;

function request(text = "Posthuman"): ContinuityMutationRequest {
  return {
    operation: "edit-fact",
    noteId: NOTE_ID,
    factId: FACT_ID,
    draft: {
      id: FACT_ID,
      property: "species",
      value: { kind: "text", text },
    },
  };
}

describe("continuity mutation execution", () => {
  it("shows the exact changed source lines and unchanged character counts", () => {
    const plan = planContinuityMutation(SOURCE, request());
    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    expect(previewContinuityMutation(plan)).toEqual({
      before: '      text: "Human"\n',
      after: '      text: "Posthuman"\n',
      firstLine: 8,
      unchangedBeforeCharacters: SOURCE.indexOf('      text: "Human"'),
      unchangedAfterCharacters: SOURCE.length - SOURCE.indexOf("---\nBody"),
    });
  });

  it("freshly replans, writes once through the compare boundary, and undoes exactly", async () => {
    const frozen = planContinuityMutation(SOURCE, request());
    expect(frozen.kind).toBe("ready");
    if (frozen.kind !== "ready") return;
    let disk = SOURCE;
    let writes = 0;
    const io = {
      read: async () => disk,
      write: async (_path: string, text: string) => {
        writes += 1;
        disk = text;
      },
    };

    const applied = await executeContinuityMutation("note.md", frozen, request(), io);
    expect(applied.kind).toBe("applied");
    expect(disk).toBe(frozen.updatedText);
    expect(writes).toBe(1);
    if (applied.kind !== "applied") return;
    expect(await undoContinuityMutation(applied.undo, io)).toEqual({ kind: "undone" });
    expect(disk).toBe(SOURCE);
    expect(writes).toBe(2);
  });

  it("refuses stale previews, replanning drift, write races, and stale Undo", async () => {
    const frozen = planContinuityMutation(SOURCE, request());
    expect(frozen.kind).toBe("ready");
    if (frozen.kind !== "ready") return;
    let disk = `${SOURCE}external`;
    let writes = 0;
    const io = {
      read: async () => disk,
      write: async (_path: string, text: string) => {
        writes += 1;
        disk = text;
      },
    };
    expect(await executeContinuityMutation("note.md", frozen, request(), io)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("changed after this preview"),
    });
    expect(writes).toBe(0);

    disk = SOURCE;
    expect(await executeContinuityMutation("note.md", frozen, request("Cyborg"), io)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("no longer matches"),
    });
    expect(writes).toBe(0);

    let reads = 0;
    const raced = await executeContinuityMutation("note.md", frozen, request(), {
      read: async () => {
        reads += 1;
        return reads === 1 ? SOURCE : `${SOURCE}race`;
      },
      write: async () => {
        writes += 1;
      },
    });
    expect(raced).toMatchObject({ kind: "failed", message: expect.stringContaining("changed while") });
    expect(writes).toBe(0);

    disk = `${frozen.updatedText}later`;
    expect(await undoContinuityMutation({
      path: "note.md",
      noteId: NOTE_ID,
      factId: FACT_ID,
      originalText: SOURCE,
      updatedText: frozen.updatedText,
      label: "Undo edit",
    }, io)).toMatchObject({ kind: "failed", message: expect.stringContaining("will not overwrite") });
    expect(writes).toBe(0);
  });
});
