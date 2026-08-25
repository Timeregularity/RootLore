// A small per-IP limiter protects GitHub and Groq quotas in the public demo.
export function createRateLimiter({ windowMs, maximum }) {
  const clients = new Map();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip;
    const existing = clients.get(key);
    const record = !existing || now >= existing.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : existing;

    record.count += 1;
    clients.set(key, record);
    response.set("X-RateLimit-Limit", String(maximum));
    response.set("X-RateLimit-Remaining", String(Math.max(maximum - record.count, 0)));
    response.set("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));

    if (record.count > maximum) {
      return response.status(429).json({
        error: "Analysis limit reached. Please try again later.",
      });
    }

    return next();
  };
}
