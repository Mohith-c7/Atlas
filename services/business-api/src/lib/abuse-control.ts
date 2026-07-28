import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

type RateLimitPolicy = {
  readonly maxRequests: number;
  readonly windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnabled() {
  return process.env.BUSINESS_API_RATE_LIMIT_ENABLED !== "false";
}

function readDefaultPolicy(): RateLimitPolicy {
  return {
    maxRequests: readPositiveInteger("BUSINESS_API_RATE_LIMIT_MAX_REQUESTS", 300),
    windowMs: readPositiveInteger("BUSINESS_API_RATE_LIMIT_WINDOW_MS", 60_000),
  };
}

function readCommandPolicy(): RateLimitPolicy {
  return {
    maxRequests: readPositiveInteger("BUSINESS_API_COMMAND_RATE_LIMIT_MAX_REQUESTS", 20),
    windowMs: readPositiveInteger("BUSINESS_API_COMMAND_RATE_LIMIT_WINDOW_MS", 60_000),
  };
}

function getRateLimitKey(request: FastifyRequest, policyName: string): string {
  const founderId = request.founderSession?.founderId;

  if (founderId) {
    return `${policyName}:founder:${founderId}`;
  }

  return `${policyName}:ip:${request.ip}`;
}

function getPolicyName(request: FastifyRequest): "command" | "default" {
  return request.method === "POST" && request.url.split("?")[0] === "/api/v1/commands"
    ? "command"
    : "default";
}

function isRateLimitBypassed(url: string): boolean {
  const pathname = url.split("?", 1)[0] ?? "/";

  return pathname === "/metrics" || pathname === "/health" || pathname.startsWith("/health/");
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function consumeRateLimit(key: string, policy: RateLimitPolicy, now: number) {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const bucket = {
      count: 1,
      resetAt: now + policy.windowMs,
    };
    buckets.set(key, bucket);
    return { allowed: true, remaining: policy.maxRequests - 1, resetAt: bucket.resetAt };
  }

  existing.count += 1;

  return {
    allowed: existing.count <= policy.maxRequests,
    remaining: Math.max(policy.maxRequests - existing.count, 0),
    resetAt: existing.resetAt,
  };
}

const abuseControlPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", async (request, reply) => {
    if (!isEnabled() || isRateLimitBypassed(request.url)) {
      return;
    }

    const now = Date.now();
    pruneExpiredBuckets(now);

    const policyName = getPolicyName(request);
    const policy = policyName === "command" ? readCommandPolicy() : readDefaultPolicy();
    const result = consumeRateLimit(getRateLimitKey(request, policyName), policy, now);
    const retryAfterSeconds = Math.max(Math.ceil((result.resetAt - now) / 1000), 1);

    reply.header("x-ratelimit-limit", policy.maxRequests);
    reply.header("x-ratelimit-remaining", result.remaining);
    reply.header("x-ratelimit-reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      reply.header("retry-after", retryAfterSeconds);
      await reply.status(429).send({
        code: policyName === "command" ? "COMMAND_RATE_LIMITED" : "RATE_LIMITED",
        correlationId: request.correlationId,
        message: "Too many requests. Please retry after the rate limit window resets.",
        retryAfterSeconds,
      });
    }
  });

  done();
};

export const abuseControlPlugin = fp(abuseControlPluginCallback, {
  name: "faios-abuse-control",
});
