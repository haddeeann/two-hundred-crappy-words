import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  executeLoreRename,
  mapOffsetThroughLoreRename,
  type LoreRenameIo,
} from "./rename-execution";
import { planLoreRename } from "./rename";

const ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

function fixture() {
  const files = new Map([
    ["old.md", `---\nid: "${ID}"\ntitle: "Target"\n---\n# Target`],
    ["a.md", "See [[old]]."],
    ["b.md", "Again [[old]]."],
  ]);
  const plan = planLoreRename(
    buildLoreProjectIndex([...files].map(([path, text]) => ({ path, text }))),
    "old.md",
    "Lore/new.md",
  );
  if (plan.kind !== "ready") throw new Error(plan.reason);
  return { files, plan };
}

describe("safe lore rename execution", () => {
  it("stops before writing when a previewed source changed", async () => {
    const { files, plan } = fixture();
    files.set("a.md", "Changed outside.");
    const writes: string[] = [];
    const result = await executeLoreRename(plan, memoryIo(files, writes));

    expect(result).toMatchObject({ kind: "failed", rollbackComplete: true });
    expect(writes).toEqual([]);
    expect(files.has("old.md")).toBe(true);
  });

  it("rolls back earlier link edits when a later write or move fails", async () => {
    const first = fixture();
    const firstIo = memoryIo(first.files, [], { failWrite: "b.md" });
    expect(await executeLoreRename(first.plan, firstIo)).toMatchObject({
      kind: "failed",
      rollbackComplete: true,
    });
    expect(first.files.get("a.md")).toBe("See [[old]].");

    const second = fixture();
    const secondIo = memoryIo(second.files, [], { failRename: true });
    expect(await executeLoreRename(second.plan, secondIo)).toMatchObject({
      kind: "failed",
      rollbackComplete: true,
    });
    expect(second.files.get("a.md")).toBe("See [[old]].");
    expect(second.files.get("b.md")).toBe("Again [[old]].");
    expect(second.files.has("old.md")).toBe(true);
  });

  it("writes exact link repairs before a no-clobber move and maps selections", async () => {
    const { files, plan } = fixture();
    const writes: string[] = [];
    const result = await executeLoreRename(plan, memoryIo(files, writes));

    expect(result).toEqual({ kind: "success" });
    expect(writes).toEqual(["a.md", "b.md", "old.md->Lore/new.md"]);
    expect(files.get("a.md")).toBe("See [[Lore/new.md]].");
    expect(files.get("b.md")).toBe("Again [[Lore/new.md]].");
    expect(files.has("old.md")).toBe(false);
    expect(files.get("Lore/new.md")).toContain("# Target");

    const edit = plan.fileEdits.find(({ path }) => path === "a.md");
    expect(mapOffsetThroughLoreRename(2, edit)).toBe(2);
    expect(mapOffsetThroughLoreRename(11, edit)).toBe(19);
    expect(mapOffsetThroughLoreRename(7, edit)).toBe(17);
  });
});

function memoryIo(
  files: Map<string, string>,
  writes: string[],
  failures: { failWrite?: string; failRename?: boolean } = {},
): LoreRenameIo {
  return {
    async readText(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error("missing");
      return text;
    },
    async writeText(path, text) {
      if (path === failures.failWrite) throw new Error("write refused");
      files.set(path, text);
      writes.push(path);
    },
    async renameNoClobber(sourcePath, targetPath) {
      if (failures.failRename) throw new Error("destination appeared");
      if (files.has(targetPath)) throw new Error("destination exists");
      const text = files.get(sourcePath);
      if (text === undefined) throw new Error("source missing");
      files.set(targetPath, text);
      files.delete(sourcePath);
      writes.push(`${sourcePath}->${targetPath}`);
    },
  };
}
