import type { ExecutionWorker } from "./execution-worker.js";

type PollingLogger = {
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export class ExecutionPollingLoop {
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly worker: ExecutionWorker,
    private readonly logger: PollingLogger,
    private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }

    this.logger.info(
      {
        pollIntervalMs: this.pollIntervalMs,
      },
      "Execution polling loop started",
    );

    this.timer = setInterval(() => {
      void this.drainOnce();
    }, this.pollIntervalMs);

    void this.drainOnce();
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async drainOnce(): Promise<void> {
    try {
      const result = await this.worker.runOnce();

      if (result.processed) {
        this.logger.info({ result }, "Execution polling loop processed invocation");
      }
    } catch (error) {
      this.logger.error({ error }, "Execution polling loop failed");
    }
  }
}
