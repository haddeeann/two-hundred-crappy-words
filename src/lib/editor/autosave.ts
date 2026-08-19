interface RevisionedRequest {
  path: string;
  revision: number;
}

export interface AutosaveRequest extends RevisionedRequest {
  content: string;
}

interface AutosaveOptions<TRequest extends RevisionedRequest> {
  delayMs: number;
  save: (request: TRequest) => Promise<void>;
  onStart?: (request: TRequest) => void;
  onSuccess?: (request: TRequest) => void;
  onError?: (request: TRequest, error: unknown) => void;
}

function isSameRevision<TRequest extends RevisionedRequest>(
  first: TRequest | null,
  second: TRequest,
): boolean {
  return first?.path === second.path && first.revision === second.revision;
}

export class AutosaveController<
  TRequest extends RevisionedRequest = AutosaveRequest,
> {
  private readonly options: AutosaveOptions<TRequest>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: TRequest | null = null;
  private inFlight: TRequest | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: AutosaveOptions<TRequest>) {
    this.options = options;
  }

  schedule(request: TRequest): void {
    if (this.disposed || isSameRevision(this.inFlight, request)) return;

    this.pending = request;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runPending();
    }, this.options.delayMs);
  }

  async flush(): Promise<void> {
    if (this.disposed) return;

    this.clearTimer();
    while (this.inFlightPromise || this.pending) {
      if (this.inFlightPromise) {
        await this.inFlightPromise;
      } else {
        await this.runPending();
      }
    }
  }

  cancelPending(): void {
    this.pending = null;
    this.clearTimer();
  }

  cancelPendingThrough(path: string, revision: number): void {
    if (
      this.pending?.path === path &&
      this.pending.revision <= revision
    ) {
      this.cancelPending();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPending();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async runPending(): Promise<void> {
    if (this.disposed || this.inFlightPromise || !this.pending) return;

    const request = this.pending;
    this.pending = null;
    this.inFlight = request;
    this.options.onStart?.(request);

    const operation = (async () => {
      try {
        await this.options.save(request);
        this.options.onSuccess?.(request);
      } catch (error) {
        this.options.onError?.(request, error);
      } finally {
        this.inFlight = null;
        this.inFlightPromise = null;

        // If a debounce timer elapsed while another save was running, write the
        // newer pending revision now. Otherwise its active timer remains in
        // charge so typing still gets the full idle delay.
        if (this.pending && this.timer === null && !this.disposed) {
          void this.runPending();
        }
      }
    })();

    this.inFlightPromise = operation;
    await operation;
  }
}
