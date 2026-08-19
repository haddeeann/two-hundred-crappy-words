export interface AutosaveRequest {
  path: string;
  content: string;
  revision: number;
}

interface AutosaveOptions {
  delayMs: number;
  save: (request: AutosaveRequest) => Promise<void>;
  onStart?: (request: AutosaveRequest) => void;
  onSuccess?: (request: AutosaveRequest) => void;
  onError?: (request: AutosaveRequest, error: unknown) => void;
}

function isSameRevision(
  first: AutosaveRequest | null,
  second: AutosaveRequest,
): boolean {
  return first?.path === second.path && first.revision === second.revision;
}

export class AutosaveController {
  private readonly options: AutosaveOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: AutosaveRequest | null = null;
  private inFlight: AutosaveRequest | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: AutosaveOptions) {
    this.options = options;
  }

  schedule(request: AutosaveRequest): void {
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
