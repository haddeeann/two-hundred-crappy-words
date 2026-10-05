import type { LoreFileRevision, LoreScanEntry } from "$lib/lore/scan";
import {
  MAX_MAP_IMAGE_AXIS,
  MAX_MAP_IMAGE_BYTES,
  MAX_MAP_IMAGE_PIXELS,
  type MapImage,
  type MapMediaType,
} from "./format";

export interface MapImageInspection {
  mediaType: MapMediaType;
  sha256: string;
  width: number;
  height: number;
  encodedBytes: number;
  orientation: number;
}

export type MapImageInspectionResult =
  | { kind: "ready"; inspection: MapImageInspection }
  | { kind: "oversized" | "unsupported" | "animated" | "invalid"; message: string };

export interface MapBinaryBackend {
  readDirectory(path: string): Promise<readonly LoreScanEntry[]>;
  readBytes(path: string): Promise<Uint8Array>;
  inspectFile(path: string): Promise<LoreFileRevision>;
  join(parent: string, child: string): Promise<string>;
}

type MapImagePathFailure = { kind: "missing" | "unsafe" | "unreadable"; message: string };
type MapImageReadFailure = { kind: "unreadable" | "unstable" | "oversized"; message: string };

export type MapImageLoadResult =
  | MapImagePathFailure
  | MapImageReadFailure
  | { kind: "unsupported" | "animated" | "invalid"; message: string; bytes: Uint8Array }
  | {
      kind: "changed";
      message: string;
      bytes: Uint8Array;
      inspection: MapImageInspection;
    }
  | {
      kind: "ready";
      bytes: Uint8Array;
      inspection: MapImageInspection;
      absolutePath: string;
    };

export async function inspectMapImage(bytes: Uint8Array): Promise<MapImageInspectionResult> {
  if (bytes.byteLength > MAX_MAP_IMAGE_BYTES) {
    return { kind: "oversized", message: `The image exceeds the ${MAX_MAP_IMAGE_BYTES}-byte limit.` };
  }

  const parsed = isPng(bytes)
    ? parsePng(bytes)
    : isJpeg(bytes)
      ? parseJpeg(bytes)
      : isWebp(bytes)
        ? parseWebp(bytes)
        : { kind: "unsupported" as const, message: "The file is not a PNG, JPEG, or WebP image." };
  if (parsed.kind !== "ready") return parsed;

  const swapsAxes = parsed.orientation >= 5 && parsed.orientation <= 8;
  const width = swapsAxes ? parsed.height : parsed.width;
  const height = swapsAxes ? parsed.width : parsed.height;
  if (width < 1 || height < 1 || width > MAX_MAP_IMAGE_AXIS || height > MAX_MAP_IMAGE_AXIS) {
    return {
      kind: "oversized",
      message: `The display-oriented image must be at most ${MAX_MAP_IMAGE_AXIS} pixels on either axis.`,
    };
  }
  if (width * height > MAX_MAP_IMAGE_PIXELS) {
    return {
      kind: "oversized",
      message: `The display-oriented image must contain at most ${MAX_MAP_IMAGE_PIXELS} pixels.`,
    };
  }

  return {
    kind: "ready",
    inspection: {
      mediaType: parsed.mediaType,
      sha256: await sha256(bytes),
      width,
      height,
      encodedBytes: bytes.byteLength,
      orientation: parsed.orientation,
    },
  };
}

export async function loadMapImage(
  rootPath: string,
  expected: MapImage,
  backend: MapBinaryBackend,
): Promise<MapImageLoadResult> {
  const located = await locateRegularFile(rootPath, expected.path, backend);
  if (located.kind !== "ready") return located;

  const stable = await readStableBytes(located.absolutePath, expected.path, backend);
  if (stable.kind !== "ready") return stable;
  const inspected = await inspectMapImage(stable.bytes);
  if (inspected.kind !== "ready") return { ...inspected, bytes: stable.bytes };

  const actual = inspected.inspection;
  const changes: string[] = [];
  if (actual.mediaType !== expected.mediaType) changes.push(`type is ${actual.mediaType}`);
  if (actual.sha256 !== expected.sha256) changes.push("content digest changed");
  if (actual.width !== expected.width || actual.height !== expected.height) {
    changes.push(`display size is ${actual.width} × ${actual.height}`);
  }
  if (changes.length > 0) {
    return {
      kind: "changed",
      message: `The image no longer matches the recorded map metadata: ${changes.join("; ")}. Anchors are withheld.`,
      bytes: stable.bytes,
      inspection: actual,
    };
  }
  return { kind: "ready", bytes: stable.bytes, inspection: actual, absolutePath: located.absolutePath };
}

type ParsedImage =
  | { kind: "ready"; mediaType: MapMediaType; width: number; height: number; orientation: number }
  | { kind: "unsupported" | "animated" | "invalid"; message: string };

function parsePng(bytes: Uint8Array): ParsedImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawHeader = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return invalid("The PNG contains a truncated chunk.");
    const length = readU32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > bytes.length) return invalid("The PNG contains a chunk beyond the end of the file.");
    if (!sawHeader && (type !== "IHDR" || length !== 13)) {
      return invalid("The PNG must begin with one 13-byte IHDR chunk.");
    }
    if (type === "IHDR") {
      if (sawHeader || length !== 13) return invalid("The PNG has an invalid or repeated IHDR chunk.");
      sawHeader = true;
      width = readU32Be(bytes, dataStart);
      height = readU32Be(bytes, dataStart + 4);
    } else if (type === "acTL") {
      return { kind: "animated", message: "Animated PNG is not supported for maps." };
    } else if (type === "eXIf") {
      orientation = readExifOrientation(bytes.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      if (length !== 0) return invalid("The PNG IEND chunk must be empty.");
      sawEnd = true;
      offset = next;
      break;
    }
    offset = next;
  }
  if (!sawHeader || !sawEnd || offset !== bytes.length || width === 0 || height === 0) {
    return invalid("The PNG is incomplete or has invalid dimensions.");
  }
  return { kind: "ready", mediaType: "image/png", width, height, orientation };
}

function parseJpeg(bytes: Uint8Array): ParsedImage {
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return invalid("The JPEG marker stream is malformed.");
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return invalid("The JPEG marker stream is truncated.");
    const marker = bytes[offset++]!;
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (!width || !height) return invalid("The JPEG has no supported frame header before its scan data.");
      return { kind: "ready", mediaType: "image/jpeg", width, height, orientation };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return invalid("The JPEG contains a truncated segment length.");
    const length = readU16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return invalid("The JPEG contains an invalid segment.");
    const dataStart = offset + 2;
    const dataLength = length - 2;
    if (marker === 0xe1 && dataLength >= 6 && ascii(bytes, dataStart, 6) === "Exif\u0000\u0000") {
      orientation = readExifOrientation(bytes.subarray(dataStart + 6, dataStart + dataLength));
    }
    if (isStartOfFrame(marker)) {
      if (dataLength < 6) return invalid("The JPEG frame header is truncated.");
      height = readU16Be(bytes, dataStart + 1);
      width = readU16Be(bytes, dataStart + 3);
    }
    offset += length;
  }
  return width && height
    ? { kind: "ready", mediaType: "image/jpeg", width, height, orientation }
    : invalid("The JPEG has no supported frame dimensions.");
}

function parseWebp(bytes: Uint8Array): ParsedImage {
  const declared = readU32Le(bytes, 4) + 8;
  if (declared !== bytes.length) return invalid("The WebP RIFF size does not match the file length.");
  let offset = 12;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawImage = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return invalid("The WebP contains a truncated chunk header.");
    const type = ascii(bytes, offset, 4);
    const length = readU32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const next = dataStart + length + (length % 2);
    if (next > bytes.length) return invalid("The WebP contains a chunk beyond the end of the file.");
    if (type === "ANIM" || type === "ANMF") {
      return { kind: "animated", message: "Animated WebP is not supported for maps." };
    }
    if (type === "VP8X") {
      if (length !== 10) return invalid("The WebP VP8X chunk must contain 10 bytes.");
      if ((bytes[dataStart]! & 0x02) !== 0) {
        return { kind: "animated", message: "Animated WebP is not supported for maps." };
      }
      width = 1 + readU24Le(bytes, dataStart + 4);
      height = 1 + readU24Le(bytes, dataStart + 7);
    } else if (type === "VP8 ") {
      if (length < 10 || bytes[dataStart + 3] !== 0x9d || bytes[dataStart + 4] !== 0x01 || bytes[dataStart + 5] !== 0x2a) {
        return invalid("The WebP VP8 frame header is invalid.");
      }
      const frameWidth = readU16Le(bytes, dataStart + 6) & 0x3fff;
      const frameHeight = readU16Le(bytes, dataStart + 8) & 0x3fff;
      if (!width) width = frameWidth;
      if (!height) height = frameHeight;
      sawImage = true;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataStart] !== 0x2f) return invalid("The WebP VP8L frame header is invalid.");
      const b1 = bytes[dataStart + 1]!;
      const b2 = bytes[dataStart + 2]!;
      const b3 = bytes[dataStart + 3]!;
      const b4 = bytes[dataStart + 4]!;
      const frameWidth = 1 + (b1 | ((b2 & 0x3f) << 8));
      const frameHeight = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
      if (!width) width = frameWidth;
      if (!height) height = frameHeight;
      sawImage = true;
    } else if (type === "EXIF") {
      orientation = readExifOrientation(bytes.subarray(dataStart, dataStart + length));
    }
    offset = next;
  }
  return sawImage && width && height
    ? { kind: "ready", mediaType: "image/webp", width, height, orientation }
    : invalid("The WebP contains no supported still-image frame.");
}

async function locateRegularFile(
  rootPath: string,
  relativePath: string,
  backend: MapBinaryBackend,
): Promise<{ kind: "ready"; absolutePath: string } | MapImagePathFailure> {
  const segments = relativePath.split("/");
  let directory = rootPath;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    let entries: readonly LoreScanEntry[];
    try {
      entries = await backend.readDirectory(directory);
    } catch (cause) {
      return { kind: "unreadable", message: `Could not inspect ${relativePath}: ${formatError(cause)}` };
    }
    const entry = entries.find(({ name }) => name === segment);
    if (!entry) return { kind: "missing", message: `${relativePath} is missing.` };
    if (entry.isSymlink) return { kind: "unsafe", message: `${relativePath} crosses a symbolic link.` };
    const isLast = index === segments.length - 1;
    if (isLast && (!entry.isFile || entry.isDirectory)) {
      return { kind: "unsafe", message: `${relativePath} must be a regular non-symbolic file.` };
    }
    if (!isLast && (!entry.isDirectory || entry.isFile)) {
      return { kind: "unsafe", message: `${relativePath} crosses a path segment that is not a directory.` };
    }
    try {
      directory = await backend.join(directory, segment);
    } catch (cause) {
      return { kind: "unreadable", message: `Could not resolve ${relativePath}: ${formatError(cause)}` };
    }
  }
  return { kind: "ready", absolutePath: directory };
}

async function readStableBytes(
  absolutePath: string,
  relativePath: string,
  backend: MapBinaryBackend,
): Promise<{ kind: "ready"; bytes: Uint8Array } | MapImageReadFailure> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = await backend.inspectFile(absolutePath);
      if (before.size > MAX_MAP_IMAGE_BYTES) return imageTooLarge(relativePath);
      const bytes = await backend.readBytes(absolutePath);
      const after = await backend.inspectFile(absolutePath);
      if (bytes.byteLength > MAX_MAP_IMAGE_BYTES) return imageTooLarge(relativePath);
      if (before.size === after.size && before.revision === after.revision && after.size === bytes.byteLength) {
        return { kind: "ready", bytes };
      }
    } catch (cause) {
      return { kind: "unreadable", message: `Could not read ${relativePath}: ${formatError(cause)}` };
    }
  }
  return { kind: "unstable", message: `${relativePath} kept changing while it was read.` };
}

function imageTooLarge(path: string): MapImageReadFailure {
  return { kind: "oversized", message: `${path} exceeds the ${MAX_MAP_IMAGE_BYTES}-byte image limit.` };
}

function readExifOrientation(bytes: Uint8Array): number {
  let start = 0;
  if (bytes.length >= 6 && ascii(bytes, 0, 6) === "Exif\u0000\u0000") start = 6;
  if (start + 8 > bytes.length) return 1;
  const little = ascii(bytes, start, 2) === "II";
  if (!little && ascii(bytes, start, 2) !== "MM") return 1;
  const u16 = (offset: number) => little ? readU16Le(bytes, offset) : readU16Be(bytes, offset);
  const u32 = (offset: number) => little ? readU32Le(bytes, offset) : readU32Be(bytes, offset);
  if (u16(start + 2) !== 42) return 1;
  const ifd = start + u32(start + 4);
  if (ifd + 2 > bytes.length) return 1;
  const count = u16(ifd);
  if (count > 4096 || ifd + 2 + count * 12 > bytes.length) return 1;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (u16(entry) !== 0x0112 || u16(entry + 2) !== 3 || u32(entry + 4) !== 1) continue;
    const orientation = u16(entry + 8);
    return orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function invalid(message: string): ParsedImage {
  return { kind: "invalid", message };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[offset + index]!);
  }
  return result;
}

function readU16Be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU16Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16) + (bytes[offset + 3]! * 0x1000000)) >>> 0;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
