import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(path, repositoryRoot), "utf8"),
  ) as Record<string, unknown>;
}

describe("desktop security configuration", () => {
  it("does not restore the prototype's whole-filesystem scope", () => {
    const capability = readJson("src-tauri/capabilities/default.json");
    const serialized = JSON.stringify(capability);

    expect(serialized).not.toContain('"path":"**"');
    expect(serialized).not.toContain("opener:default");
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "fs:allow-read-dir",
        "fs:allow-read-text-file",
        "fs:allow-write-text-file",
      ]),
    );
  });

  it("keeps production webview connections local to Tauri IPC", () => {
    const config = readJson("src-tauri/tauri.conf.json");
    const app = config.app as Record<string, unknown>;
    const security = app.security as Record<string, unknown>;
    const csp = security.csp as Record<string, string>;
    const devCsp = security.devCsp as Record<string, string>;

    expect(csp["default-src"]).toBe("'self'");
    expect(csp["connect-src"]).toBe("ipc: http://ipc.localhost");
    expect(csp["object-src"]).toBe("'none'");
    expect(csp["frame-src"]).toBe("'none'");
    expect(devCsp["connect-src"]).toContain("ws://localhost:1420");
    const productionNetworkSources = Object.values(csp)
      .flatMap((sources) => sources.split(/\s+/))
      .filter((source) => /^(https?|wss?):/.test(source));
    expect(productionNetworkSources).toEqual(["http://ipc.localhost"]);
  });
});
