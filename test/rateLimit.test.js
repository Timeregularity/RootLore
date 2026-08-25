import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/middleware/rateLimit.js";

function responseDouble() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("analysis limiter rejects requests above the per-IP allowance", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maximum: 2 });
  const request = { ip: "127.0.0.1" };
  let accepted = 0;

  limiter(request, responseDouble(), () => { accepted += 1; });
  limiter(request, responseDouble(), () => { accepted += 1; });
  const blocked = responseDouble();
  limiter(request, blocked, () => { accepted += 1; });

  assert.equal(accepted, 2);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /limit reached/i);
});
