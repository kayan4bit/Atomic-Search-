// Performance utilities — caching, connection pooling, and worker-pool
// helpers tuned for low-power Railway/Render free-tier instances.
// All utilities are pure Node.js with no external dependencies.

// ── Tiered LRU cache ─────────────────────────────────────────────────────────
// Two-tier: hot (small, fast) + warm (larger, slightly slower). Frequently
// accessed keys stay in the hot tier; less-used keys fall to warm.

export class TieredLRU {
  constructor({ hotCap = 100, warmCap = 500 } = {}) {
    this.hot = new Map();
    this.warm = new Map();
    this.hotCap = hotCap;
    this.warmCap = warmCap;
  }

  get(key) {
    if (this.hot.has(key)) {
      const v = this.hot.get(key);
      // Refresh position.
      this.hot.delete(key);
      this.hot.set(key, v);
      return v;
    }
    if (this.warm.has(key)) {
      const v = this.warm.get(key);
      this.warm.delete(key);
      // Promote to hot.
      this._hotSet(key, v);
      return v;
    }
    return undefined;
  }

  set(key, value) {
    this._hotSet(key, value);
  }

  _hotSet(key, value) {
    if (this.hot.has(key)) this.hot.delete(key);
    this.hot.set(key, value);
    if (this.hot.size > this.hotCap) {
      // Demote oldest hot entry to warm.
      const oldest = this.hot.keys().next().value;
      if (oldest !== undefined) {
        const v = this.hot.get(oldest);
        this.hot.delete(oldest);
        this._warmSet(oldest, v);
      }
    }
  }

  _warmSet(key, value) {
    if (this.warm.has(key)) this.warm.delete(key);
    this.warm.set(key, value);
    if (this.warm.size > this.warmCap) {
      const oldest = this.warm.keys().next().value;
      if (oldest !== undefined) this.warm.delete(oldest);
    }
  }

  delete(key) {
    this.hot.delete(key);
    this.warm.delete(key);
  }

  size() {
    return this.hot.size + this.warm.size;
  }
}

// ── TTL cache wrapper ─────────────────────────────────────────────────────────
// Wraps any Map-like store with per-entry TTL expiry.

export class TTLCache {
  constructor({ cap = 500, defaultTtlMs = 15 * 60 * 1000 } = {}) {
    this.store = new TieredLRU({ hotCap: Math.ceil(cap * 0.2), warmCap: cap });
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    const expiresAt = (ttlMs ?? this.defaultTtlMs) ? Date.now() + (ttlMs ?? this.defaultTtlMs) : null;
    this.store.set(key, { value, expiresAt });
  }

  delete(key) {
    this.store.delete(key);
  }
}

// ── Request deduplication ─────────────────────────────────────────────────────
// Coalesces concurrent identical requests into a single in-flight fetch.
// Prevents thundering-herd on cache misses.

export class RequestDeduplicator {
  constructor() {
    this.inflight = new Map();
  }

  async dedupe(key, fn) {
    if (this.inflight.has(key)) {
      return this.inflight.get(key);
    }
    const promise = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

// ── Concurrency limiter ───────────────────────────────────────────────────────
// Limits how many async tasks run simultaneously. Useful for CPU-intensive
// work (NSFW detection, HTML parsing) on low-RAM instances.

export class ConcurrencyLimiter {
  constructor(limit = 4) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        this.running++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            if (this.queue.length > 0) {
              const next = this.queue.shift();
              next();
            }
          });
      };
      if (this.running < this.limit) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }
}

// ── Batch processor ───────────────────────────────────────────────────────────
// Collects items over a short window and processes them in a single batch.
// Reduces DB round-trips for high-frequency writes (e.g. crawl queue inserts).

export class BatchProcessor {
  constructor(processFn, { maxBatchSize = 50, maxWaitMs = 100 } = {}) {
    this.processFn = processFn;
    this.maxBatchSize = maxBatchSize;
    this.maxWaitMs = maxWaitMs;
    this.pending = [];
    this.timer = null;
  }

  add(item) {
    return new Promise((resolve, reject) => {
      this.pending.push({ item, resolve, reject });
      if (this.pending.length >= this.maxBatchSize) {
        this._flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this._flush(), this.maxWaitMs);
      }
    });
  }

  _flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.pending.length) return;
    const batch = this.pending.splice(0, this.maxBatchSize);
    const items = batch.map((b) => b.item);
    Promise.resolve()
      .then(() => this.processFn(items))
      .then(
        (results) => batch.forEach((b, i) => b.resolve(Array.isArray(results) ? results[i] : results)),
        (err) => batch.forEach((b) => b.reject(err))
      );
  }
}

// ── Memory pressure monitor ───────────────────────────────────────────────────
// Tracks heap usage and exposes a simple "is under pressure?" check.
// Used by the crawler and other subsystems to back off when RAM is tight.

const PRESSURE_HIGH_MB = Number(
  (typeof process !== "undefined" && process.env.MEM_PRESSURE_HIGH_MB) || 380
);
const PRESSURE_LOW_MB = Number(
  (typeof process !== "undefined" && process.env.MEM_PRESSURE_LOW_MB) || 280
);

let _underPressure = false;

export function checkMemoryPressure() {
  if (typeof process === "undefined") return false;
  try {
    const mb = process.memoryUsage().heapUsed / 1024 / 1024;
    if (!_underPressure && mb > PRESSURE_HIGH_MB) {
      _underPressure = true;
      console.warn(`[perf] memory pressure: ${mb.toFixed(0)}MB > ${PRESSURE_HIGH_MB}MB`);
    } else if (_underPressure && mb < PRESSURE_LOW_MB) {
      _underPressure = false;
      console.info(`[perf] memory pressure relieved: ${mb.toFixed(0)}MB < ${PRESSURE_LOW_MB}MB`);
    }
    return _underPressure;
  } catch {
    return false;
  }
}

export function isUnderMemoryPressure() {
  return _underPressure;
}

// ── Response compression helper ───────────────────────────────────────────────
// Compresses a JSON-serialisable value to a Buffer using Node's built-in
// zlib. Returns the original string if compression isn't available or
// doesn't save space.

export async function compressJson(value) {
  if (typeof process === "undefined" || !process.versions?.node) {
    return JSON.stringify(value);
  }
  try {
    const { gzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const gzipAsync = promisify(gzip);
    const json = JSON.stringify(value);
    const compressed = await gzipAsync(Buffer.from(json, "utf8"));
    // Only use compressed form if it's actually smaller.
    return compressed.length < json.length ? compressed : json;
  } catch {
    return JSON.stringify(value);
  }
}

// ── Shared instances ──────────────────────────────────────────────────────────
// Module-level singletons so all callers share the same pools.

export const searchCache = new TTLCache({ cap: 300, defaultTtlMs: 60 * 60 * 1000 });
export const imageCache = new TTLCache({ cap: 200, defaultTtlMs: 30 * 60 * 1000 });
export const safetyCache = new TTLCache({ cap: 500, defaultTtlMs: 60 * 60 * 1000 });
export const searchDeduplicator = new RequestDeduplicator();
export const parseLimiter = new ConcurrencyLimiter(
  Number((typeof process !== "undefined" && process.env.PARSE_CONCURRENCY) || 4)
);
