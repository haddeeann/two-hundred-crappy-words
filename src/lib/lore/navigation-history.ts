export const DEFAULT_LORE_HISTORY_LIMIT = 50;

export interface LoreNavigationLocation {
  editorPath: string | null;
  editorFingerprint: string | null;
  selectionStart: number;
  selectionEnd: number;
  referencePath: string | null;
  referenceFingerprint: string | null;
}

export class LoreNavigationHistory {
  readonly #limit: number;
  #entries: LoreNavigationLocation[] = [];
  #index = -1;

  constructor(limit = DEFAULT_LORE_HISTORY_LIMIT) {
    if (!Number.isSafeInteger(limit) || limit < 2) {
      throw new RangeError("Lore navigation history limit must be at least two.");
    }
    this.#limit = limit;
  }

  get canGoBack(): boolean {
    return this.#index > 0;
  }

  get canGoForward(): boolean {
    return this.#index >= 0 && this.#index < this.#entries.length - 1;
  }

  get size(): number {
    return this.#entries.length;
  }

  recordTransition(
    from: LoreNavigationLocation,
    to: LoreNavigationLocation,
  ): void {
    if (sameLoreLocation(from, to)) return;
    if (this.#index === -1) {
      this.#entries = [cloneLocation(from)];
      this.#index = 0;
    } else {
      this.#entries[this.#index] = cloneLocation(from);
      this.#entries.splice(this.#index + 1);
    }
    this.#entries.push(cloneLocation(to));
    this.#index = this.#entries.length - 1;
    if (this.#entries.length > this.#limit) {
      const overflow = this.#entries.length - this.#limit;
      this.#entries.splice(0, overflow);
      this.#index -= overflow;
    }
  }

  replaceCurrent(location: LoreNavigationLocation): void {
    if (this.#index >= 0) this.#entries[this.#index] = cloneLocation(location);
  }

  peek(direction: "back" | "forward"): LoreNavigationLocation | null {
    const target = this.#index + (direction === "back" ? -1 : 1);
    return target >= 0 && target < this.#entries.length
      ? cloneLocation(this.#entries[target]!)
      : null;
  }

  commit(direction: "back" | "forward"): boolean {
    if (direction === "back" && this.canGoBack) {
      this.#index -= 1;
      return true;
    }
    if (direction === "forward" && this.canGoForward) {
      this.#index += 1;
      return true;
    }
    return false;
  }

  dropCandidate(direction: "back" | "forward"): boolean {
    if (direction === "back" && this.canGoBack) {
      this.#entries.splice(this.#index - 1, 1);
      this.#index -= 1;
      return true;
    }
    if (direction === "forward" && this.canGoForward) {
      this.#entries.splice(this.#index + 1, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this.#entries = [];
    this.#index = -1;
  }
}

export function sameLoreLocation(
  first: LoreNavigationLocation,
  second: LoreNavigationLocation,
): boolean {
  return (
    first.editorPath === second.editorPath &&
    first.editorFingerprint === second.editorFingerprint &&
    first.selectionStart === second.selectionStart &&
    first.selectionEnd === second.selectionEnd &&
    first.referencePath === second.referencePath &&
    first.referenceFingerprint === second.referenceFingerprint
  );
}

function cloneLocation(location: LoreNavigationLocation): LoreNavigationLocation {
  return { ...location };
}
