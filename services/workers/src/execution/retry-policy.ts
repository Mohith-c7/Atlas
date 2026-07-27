export type RetryDecision =
  | {
      readonly shouldRetry: true;
      readonly nextAttemptAt: Date;
      readonly retryCount: number;
    }
  | {
      readonly shouldRetry: false;
    };

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export function calculateRetryDecision({
  retryable,
  retryCount,
  maxRetries,
  now = new Date(),
}: {
  retryable: boolean;
  retryCount: number;
  maxRetries: number;
  now?: Date;
}): RetryDecision {
  if (!retryable || retryCount >= maxRetries) {
    return { shouldRetry: false };
  }

  const nextRetryCount = retryCount + 1;
  const exponentialBackoff = Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(nextRetryCount - 1, 0),
    MAX_BACKOFF_MS,
  );
  const jitter = Math.floor(exponentialBackoff * 0.2 * Math.random());

  return {
    shouldRetry: true,
    retryCount: nextRetryCount,
    nextAttemptAt: new Date(now.getTime() + exponentialBackoff + jitter),
  };
}
