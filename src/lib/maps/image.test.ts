import { describe, expect, it } from "vitest";

import type { LoreFileRevision, LoreScanEntry } from "$lib/lore/scan";
import type { MapImage } from "./format";
import { inspectMapImage, loadMapImage, type MapBinaryBackend } from "./image";

const ROOT = "/world";

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function le32(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function text(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function pngChunk(type: string, data: readonly number[]): number[] {
  return [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];
}

function png(width = 16, height = 12, extra: number[] = []): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...extra,
    ...pngChunk("IEND", []),
  ]);
}

function littleEndianOrientation(orientation: number): number[] {
  return [
    ...text("II"), 42, 0, 8, 0, 0, 0,
    1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
  ];
}

function jpeg(width = 40, height = 20, orientation = 1): Uint8Array {
  const exif = [...text("Exif"), 0, 0, ...littleEndianOrientation(orientation)];
  const frame = [8, (height >>> 8) & 255, height & 255, (width >>> 8) & 255, width & 255, 1, 1, 0x11, 0];
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, ((exif.length + 2) >>> 8) & 255, (exif.length + 2) & 255, ...exif,
    0xff, 0xc0, 0, frame.length + 2, ...frame,
    0xff, 0xda,
  ]);
}

function webpChunk(type: string, data: readonly number[]): number[] {
  return [...text(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}

function webpLossless(width = 30, height = 15, prefixChunks: number[] = []): Uint8Array {
  const widthBits = width - 1;
  const heightBits = height - 1;
  const frame = [
    0x2f,
    widthBits & 255,
    ((widthBits >>> 8) & 0x3f) | ((heightBits & 0x03) << 6),
    (heightBits >>> 2) & 255,
    (heightBits >>> 10) & 0x0f,
  ];
  const chunks = [...prefixChunks, ...webpChunk("VP8L", frame)];
  return new Uint8Array([...text("RIFF"), ...le32(4 + chunks.length), ...text("WEBP"), ...chunks]);
}

describe("map image inspection", () => {
  it("identifies static PNG from bytes rather than the filename", async () => {
    await expect(inspectMapImage(png())).resolves.toMatchObject({
      kind: "ready",
      inspection: {
        mediaType: "image/png",
        width: 16,
        height: 12,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it("resolves JPEG EXIF orientation into display dimensions", async () => {
    await expect(inspectMapImage(jpeg(40, 20, 6))).resolves.toMatchObject({
      kind: "ready",
      inspection: { mediaType: "image/jpeg", width: 20, height: 40, orientation: 6 },
    });
  });

  it("reads lossless WebP dimensions", async () => {
    await expect(inspectMapImage(webpLossless())).resolves.toMatchObject({
      kind: "ready",
      inspection: { mediaType: "image/webp", width: 30, height: 15 },
    });
  });

  it("rejects APNG and animated WebP", async () => {
    await expect(inspectMapImage(png(16, 12, pngChunk("acTL", [0, 0, 0, 1, 0, 0, 0, 0])))).resolves.toMatchObject({ kind: "animated" });
    const extended = webpChunk("VP8X", [0x02, 0, 0, 0, 29, 0, 0, 14, 0, 0]);
    await expect(inspectMapImage(webpLossless(30, 15, extended))).resolves.toMatchObject({ kind: "animated" });
  });

  it("rejects unsupported, malformed, and decoded-over-limit images", async () => {
    await expect(inspectMapImage(new Uint8Array(text("GIF89a")))).resolves.toMatchObject({ kind: "unsupported" });
    await expect(inspectMapImage(png().subarray(0, 20))).resolves.toMatchObject({ kind: "invalid" });
    await expect(inspectMapImage(png(8193, 1))).resolves.toMatchObject({ kind: "oversized" });
    await expect(inspectMapImage(png(7000, 7000))).resolves.toMatchObject({ kind: "oversized" });
  });
});

type FileNode = {
  type: "file";
  bytes: Uint8Array;
  inspections?: string[];
  reportedSize?: number;
  unreadable?: boolean;
};
type Node = FileNode | { type: "directory" } | { type: "symlink" };

function backend(nodes: Record<string, Node>): MapBinaryBackend {
  const normalize = (path: string) => path === ROOT ? "" : path.slice(`${ROOT}/`.length);
  return {
    async readDirectory(path): Promise<readonly LoreScanEntry[]> {
      const prefix = normalize(path);
      const childPrefix = prefix ? `${prefix}/` : "";
      const names = new Set<string>();
      for (const candidate of Object.keys(nodes)) {
        if (!candidate.startsWith(childPrefix)) continue;
        const rest = candidate.slice(childPrefix.length);
        if (rest && !rest.includes("/")) names.add(rest);
      }
      return [...names].map((name) => {
        const node = nodes[`${childPrefix}${name}`]!;
        return {
          name,
          isFile: node.type === "file",
          isDirectory: node.type === "directory",
          isSymlink: node.type === "symlink",
        };
      });
    },
    async readBytes(path): Promise<Uint8Array> {
      const node = nodes[normalize(path)];
      if (!node || node.type !== "file") throw new Error("not a file");
      if (node.unreadable) throw new Error("permission denied");
      return node.bytes;
    },
    async inspectFile(path): Promise<LoreFileRevision> {
      const node = nodes[normalize(path)];
      if (!node || node.type !== "file") throw new Error("not a file");
      return {
        size: node.reportedSize ?? node.bytes.byteLength,
        revision: node.inspections?.shift() ?? "stable",
      };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

async function expectedImage(bytes: Uint8Array): Promise<MapImage> {
  const result = await inspectMapImage(bytes);
  if (result.kind !== "ready") throw new Error(result.message);
  return { path: "Maps/system.anything", ...result.inspection };
}

describe("map image loading", () => {
  it("traverses each segment and stable-loads only the exact regular file", async () => {
    const bytes = png();
    const expected = await expectedImage(bytes);
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "file", bytes } }))).resolves.toMatchObject({
      kind: "ready",
      absolutePath: "/world/Maps/system.anything",
      inspection: { sha256: expected.sha256 },
    });
  });

  it("keeps missing paths, symbolic segments, and non-files distinct", async () => {
    const expected = await expectedImage(png());
    await expect(loadMapImage(ROOT, expected, backend({}))).resolves.toMatchObject({ kind: "missing" });
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "symlink" } }))).resolves.toMatchObject({ kind: "unsafe" });
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "directory" } }))).resolves.toMatchObject({ kind: "unsafe" });
  });

  it("reports changed, unstable, unreadable, and unsupported bytes without guessing", async () => {
    const bytes = png();
    const expected = await expectedImage(bytes);
    const different = png(15, 12);
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "file", bytes: different } }))).resolves.toMatchObject({ kind: "changed", message: expect.stringContaining("Anchors are withheld") });
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "file", bytes, inspections: ["a", "b", "c", "d"] } }))).resolves.toMatchObject({ kind: "unstable" });
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "file", bytes, unreadable: true } }))).resolves.toMatchObject({ kind: "unreadable" });
    await expect(loadMapImage(ROOT, expected, backend({ Maps: { type: "directory" }, "Maps/system.anything": { type: "file", bytes: new Uint8Array(text("GIF89a")) } }))).resolves.toMatchObject({ kind: "unsupported" });
  });
});
