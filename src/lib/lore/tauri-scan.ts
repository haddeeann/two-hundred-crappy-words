import { join } from "@tauri-apps/api/path";
import { readDir, readTextFile, stat } from "@tauri-apps/plugin-fs";

import type { LoreScanBackend } from "./scan";

export const tauriLoreScanBackend: LoreScanBackend = {
  async readDirectory(path) {
    const entries = await readDir(path);
    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
    }));
  },
  readText: readTextFile,
  async inspectFile(path) {
    const info = await stat(path);
    return {
      size: info.size,
      revision: `${info.mtime?.getTime() ?? "unknown"}:${info.size}`,
    };
  },
  join,
};
