export interface LoreChangeBatch {
  paths: string[];
  revision: number;
}

export function shouldReconcileWatchEvent(type: unknown): boolean {
  if (type && typeof type === "object") {
    if ("access" in type) return false;
    if ("modify" in type) {
      const modify = (type as { modify?: unknown }).modify;
      if (modify && typeof modify === "object" && "kind" in modify) {
        const detail = modify as { kind?: unknown; mode?: unknown };
        if (detail.kind === "metadata" && detail.mode === "access-time") return false;
      }
    }
  }
  return true;
}

export class LoreChangeMonitor {
  private readonly delayMs: number;
  private readonly reconcile: (batch: LoreChangeBatch) => Promise<void>;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private operations: Promise<void> = Promise.resolve();
  private revision = 0;
  private disposed = false;

  constructor({
    delayMs = 250,
    reconcile,
  }: {
    delayMs?: number;
    reconcile: (batch: LoreChangeBatch) => Promise<void>;
  }) {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
      throw new RangeError("Lore monitor delay must be a non-negative safe integer.");
    }
    this.delayMs = delayMs;
    this.reconcile = reconcile;
  }

  notify(paths: readonly string[]): void {
    if (this.disposed) return;
    for (const path of paths) this.pending.add(path);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueuePending();
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.enqueuePending();
    await this.operations;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }

  private enqueuePending(): void {
    if (this.disposed || this.pending.size === 0) return;
    const paths = [...this.pending];
    this.pending.clear();
    const batch = { paths, revision: ++this.revision };
    this.operations = this.operations.catch(() => {}).then(() => this.reconcile(batch));
  }
}
