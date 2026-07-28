import type { PrismaClient } from "@faios/database";
import type { MemoryVectorWorker } from "./memory-vector-worker.js";

type PollingLogger = {
  info(payload: unknown, message: string): void;
  error(payload: unknown, message: string): void;
};

export class MemoryVectorPollingLoop {
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly database: PrismaClient,
    private readonly worker: MemoryVectorWorker,
    private readonly logger: PollingLogger,
    private readonly pollIntervalMs = 5000,
  ) {}

  public start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    try {
      const jobs = await this.database.memoryVectorJob.findMany({
        where: {
          status: "PENDING",
          OR: [
            {
              nextAttemptAt: null,
            },
            {
              nextAttemptAt: {
                lte: new Date(),
              },
            },
          ],
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 10,
      });

      for (const job of jobs) {
        await this.worker.runJob(job.id);
      }
    } catch (error) {
      this.logger.error(
        {
          error,
        },
        "Memory vector polling loop failed",
      );
    }
  }
}
