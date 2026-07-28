import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";

const securityHeadersPluginCallback: FastifyPluginCallback = (server, _options, done) => {
  server.addHook("onRequest", async (_request, reply) => {
    reply.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    reply.header("cross-origin-opener-policy", "same-origin");
    reply.header("cross-origin-resource-policy", "same-site");
    reply.header("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=()");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");

    if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
  });

  done();
};

export const securityHeadersPlugin = fp(securityHeadersPluginCallback, {
  name: "faios-security-headers",
});
