import { join } from "@tauri-apps/api/path";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";

import type { MapBinaryBackend } from "./image";

export const tauriMapBinaryBackend: MapBinaryBackend = {
  async readDirectory(path) {
    const entries = await readDir(path);
    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
    }));
  },
  readBytes: readFile,
  async inspectFile(path) {
    const info = await stat(path);
    return {
      size: info.size,
      revision: `${info.mtime?.getTime() ?? "unknown"}:${info.size}`,
    };
  },
  join,
};
