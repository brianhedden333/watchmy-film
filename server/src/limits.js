// Small in-memory rate limiter (one server process, so memory is enough).

export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, list] of hits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip;
    const cutoff = Date.now() - windowMs;
    const list = (hits.get(key) || []).filter((t) => t > cutoff);
    if (list.length >= max) return res.status(429).json({ error: "Too many tries. Wait a few minutes and try again." });
    list.push(Date.now());
    hits.set(key, list);
    next();
  };
}
