import { describe, expect, it, vi } from "vitest";

import { MAPS_FORMAT, type MapImage } from "./format";
import { executeMapsMutationWithImport, type PendingMapImageImport } from "./import-execution";
import type { MapsProjectLoadResult } from "./load";
import { planMapsMutation, type MapsMutationRequest } from "./mutation";
import type { MapsMutationIo } from "./mutation-execution";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const MAP_ID = "26a31375-e38d-48bb-833d-6357f2dc086b";
const image: MapImage = {
  path: "Maps/external.png",
  mediaType: "image/png",
  sha256: "5bd45d0986e2f03ad9c989c87f101846c35f9b4b593c9a577acbc032a649d21a",
  width: 10,
  height: 10,
};
const request: MapsMutationRequest = { kind: "add-map", mapId: MAP_ID, title: "External", image };
const imageImport: PendingMapImageImport = {
  sourcePath: "/outside/external.png",
  targetName: "external.png",
  targetPath: image.path,
  sha256: image.sha256,
};

function ready(text: string): Extract<MapsProjectLoadResult, { kind: "ready" }> {
  const parsed = JSON.parse(text);
  return {
    kind: "ready",
    text,
    fingerprint: "ignored-by-test",
    source: parsed,
    mapsProject: parsed,
  };
}

function harness(options: { failWrite?: boolean; committedOnFailure?: boolean } = {}) {
  let text: string | null = null;
  const plan = planMapsMutation(null, PROJECT_ID, request);
  if (plan.kind !== "ready") throw new Error("plan");
  const reload = vi.fn(async (): Promise<MapsProjectLoadResult> => {
    if (options.committedOnFailure) return ready(plan.updatedText);
    if (text === null) return { kind: "absent" };
    const project = ready(text);
    project.fingerprint = plan.updatedFingerprint;
    return project;
  });
  const mapsIo: MapsMutationIo = {
    reload,
    createNew: vi.fn(async (next) => {
      if (options.failWrite) throw new Error("stale maps source");
      text = next;
    }),
    replaceAtomic: vi.fn(),
    removeCreated: vi.fn(),
  };
  const copyNew = vi.fn(async () => undefined);
  const rollbackExact = vi.fn(async () => undefined);
  return { plan, mapsIo, copyNew, rollbackExact };
}

describe("map image import transaction", () => {
  it("keeps a verified copy after the map JSON applies", async () => {
    const value = harness();
    const result = await executeMapsMutationWithImport(
      value.plan, request, value.mapsIo, imageImport,
      { copyNew: value.copyNew, rollbackExact: value.rollbackExact },
    );
    expect(result.kind).toBe("applied");
    expect(value.copyNew).toHaveBeenCalledOnce();
    expect(value.rollbackExact).not.toHaveBeenCalled();
  });

  it("rolls back a new copy when the maps write refuses", async () => {
    const value = harness({ failWrite: true });
    const result = await executeMapsMutationWithImport(
      value.plan, request, value.mapsIo, imageImport,
      { copyNew: value.copyNew, rollbackExact: value.rollbackExact },
    );
    expect(result).toMatchObject({ kind: "failed", message: expect.stringContaining("stale maps source") });
    expect(value.rollbackExact).toHaveBeenCalledWith(imageImport);
  });

  it("does not attempt a maps write when create-new image copy collides", async () => {
    const value = harness();
    value.copyNew.mockRejectedValueOnce(new Error("already exists"));
    const result = await executeMapsMutationWithImport(
      value.plan, request, value.mapsIo, imageImport,
      { copyNew: value.copyNew, rollbackExact: value.rollbackExact },
    );
    expect(result).toMatchObject({ kind: "failed", message: expect.stringContaining("already exists") });
    expect(value.mapsIo.createNew).not.toHaveBeenCalled();
    expect(value.rollbackExact).not.toHaveBeenCalled();
  });

  it("retains the image when a failed verification still finds the committed map", async () => {
    const value = harness({ failWrite: true, committedOnFailure: true });
    const result = await executeMapsMutationWithImport(
      value.plan, request, value.mapsIo, imageImport,
      { copyNew: value.copyNew, rollbackExact: value.rollbackExact },
    );
    expect(result).toMatchObject({ kind: "failed", message: expect.stringContaining("retained for review") });
    expect(value.rollbackExact).not.toHaveBeenCalled();
  });

  it("imports a new no-clobber copy for an image replacement", async () => {
    const original = `${JSON.stringify({
      format: MAPS_FORMAT,
      formatVersion: 1,
      projectId: PROJECT_ID,
      maps: [{
        id: MAP_ID,
        title: "Existing",
        image: { ...image, path: "Maps/old.png", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        canvas: { width: 10, height: 10 },
        anchors: [],
      }],
    }, null, 2)}\n`;
    const replacementRequest: MapsMutationRequest = {
      kind: "replace-image",
      mapId: MAP_ID,
      image,
      clearAnchors: false,
    };
    const plan = planMapsMutation(original, PROJECT_ID, replacementRequest);
    if (plan.kind !== "ready") throw new Error("plan");
    let text = original;
    const mapsIo: MapsMutationIo = {
      reload: vi.fn(async () => {
        const project = ready(text);
        project.fingerprint = text === original ? plan.originalFingerprint! : plan.updatedFingerprint;
        return project;
      }),
      createNew: vi.fn(),
      replaceAtomic: vi.fn(async (expected, next) => {
        expect(expected).toBe(text);
        text = next;
      }),
      removeCreated: vi.fn(),
    };
    const copyNew = vi.fn(async () => undefined);
    const rollbackExact = vi.fn(async () => undefined);

    const result = await executeMapsMutationWithImport(
      plan,
      replacementRequest,
      mapsIo,
      imageImport,
      { copyNew, rollbackExact },
    );
    expect(result.kind).toBe("applied");
    expect(copyNew).toHaveBeenCalledWith(imageImport);
    expect(rollbackExact).not.toHaveBeenCalled();
    expect(JSON.parse(text).maps[0].image).toEqual(image);
  });
});
