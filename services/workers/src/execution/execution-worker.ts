import type { ExecutionRepository } from "./execution.repository.js";
import type { McpToolExecutor } from "./mcp-tool-executor.js";

type WorkerLogger = {
  info(payload: unknown, message: string): void;
};

export type ExecutionWorkerRunResult =
  | {
      readonly processed: false;
    }
  | {
      readonly processed: true;
      readonly invocationId: string;
      readonly status: "succeeded" | "failed";
    };

export class ExecutionWorker {
  public constructor(
    private readonly repository: ExecutionRepository,
    private readonly executor: McpToolExecutor,
    private readonly logger: WorkerLogger,
  ) {}

  public async runOnce(): Promise<ExecutionWorkerRunResult> {
    const job = await this.repository.claimNextPendingInvocation();

    return this.processClaimedJob(job);
  }

  public async runInvocation(invocationId: string): Promise<ExecutionWorkerRunResult> {
    const job = await this.repository.claimPendingInvocationById(invocationId);

    return this.processClaimedJob(job);
  }

  private async processClaimedJob(
    job: Awaited<ReturnType<ExecutionRepository["claimNextPendingInvocation"]>>,
  ): Promise<ExecutionWorkerRunResult> {
    if (!job) {
      return { processed: false };
    }

    this.logger.info(
      {
        invocationId: job.invocationId,
        commandId: job.commandId,
        capabilityKey: job.capabilityKey,
      },
      "Claimed tool invocation",
    );

    const result = await this.executor.execute(job);

    if (result.status === "succeeded") {
      await this.repository.markInvocationSucceeded(job.invocationId, result.responsePayload);
      return {
        processed: true,
        invocationId: job.invocationId,
        status: "succeeded",
      };
    }

    await this.repository.markInvocationFailed(
      job.invocationId,
      result.errorCode,
      result.errorMessage,
    );

    return {
      processed: true,
      invocationId: job.invocationId,
      status: "failed",
    };
  }
}
