import { describe, expect, it } from "vitest";

import {
  initialWritingLayout,
  transitionWritingLayout,
} from "./writing-layout";

describe("ephemeral writing layout", () => {
  it("enters focus only for an active draft outside the corkboard", () => {
    const standard = initialWritingLayout();
    expect(transitionWritingLayout(standard, {
      kind: "enter-focus",
      hasActiveDraft: true,
      corkboardOpen: false,
    })).toEqual({ mode: "focus" });
    expect(transitionWritingLayout(standard, {
      kind: "enter-focus",
      hasActiveDraft: false,
      corkboardOpen: false,
    })).toBe(standard);
    expect(transitionWritingLayout(standard, {
      kind: "enter-focus",
      hasActiveDraft: true,
      corkboardOpen: true,
    })).toBe(standard);
  });

  it("exits explicitly and clears on project replacement", () => {
    const focused = { mode: "focus" } as const;
    expect(transitionWritingLayout(focused, { kind: "exit-focus" }))
      .toEqual({ mode: "standard" });
    expect(transitionWritingLayout(focused, { kind: "project-replaced" }))
      .toEqual({ mode: "standard" });
  });
});
