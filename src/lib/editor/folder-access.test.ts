import { describe, expect, it } from "vitest";

import { folderDialogOptions } from "./folder-access";

describe("folder access", () => {
  it("requests recursive scope for a selected writing project", () => {
    expect(folderDialogOptions).toMatchObject({
      directory: true,
      multiple: false,
      recursive: true,
    });
  });
});
