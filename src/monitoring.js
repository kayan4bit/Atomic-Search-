// Monitoring & Logging — tracks indexing progress, search performance,
// system health, and errors. All metrics are aggregate — no PII ever stored.

import { stats as storageStats } from "./storage.js";
import { getIndexerStats } from "./fast-indexer.js";

// ── In-memory metrics store ───────────────────────────────────────────────────
const metrics = {
  startedAt: Date.now(),
  // Indexing
  indexing: {
    totalCrawled: 0,
    totalIndexed: 0,
    totalErrors:  0,
    lastCrawlAt:  null,
    crawlsPerMin: 0,
  },
  // Search
  search: {
    totalRequests: 0,
    totalErrors:   0,
    cacheHits:     0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    durations:     [], // rolling window, max 500
  },
  // System
  system: {
    heapUsedMb:  0,
    heapTotalMb: 0,
    uptimeMs:    0,
    nodeVersion: typeof process !== "undefined" ? process.version : "unknown",
  },
  // Errors
  errors: [], // max 200 entries
};

const MAX_DURATION_SAMPLES = 500;
const MAX_ERROR_LOG        = 200;

// ── Indexing metrics ──────────────────────────────────────────────────────────
export function recordCrawl({ success = true } = {}) {
  metrics.indexing.totalCrawled++;
  if (success) metrics.indexing.totalIndexed++;
  else         metrics.indexing.totalErrors++;
  metrics.indexing.lastCrawlAt = Date.now();
}

// ── Search metrics ────────────────────────────────────────────────────────────
export function recordSearch({ durationMs = 0, cached = false, error = false } = {}) {
  metrics.search.totalRequests++;
  if (error)  metrics.search.totalErrors++;
  if (cached) metrics.search.cacheHits++;

  const d = metrics.search.durations;
  d.push(durationMs);
  if (d.length > MAX_DURATION_SAMPLES) d.shift();

  if (d.length) {
    const sum = d.reduce((a, b) => a + b, 0);
    metrics.search.avgDurationMs = Math.round(sum / d.length);
    const sorted = [...d].sort((a, b) => a - b);
    metrics.search.p95DurationMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
  }
}

// ── Error logging ─────────────────────────────────────────────────────────────
export function logError(context, err) {
  const entry = {
    context,
    message: String(err?.message || err || "unknown error"),
    at: Date.now(),
  };
  metrics.errors.push(entry);
  if (metrics.errors.length > MAX_ERROR_LOG) metrics.errors.shift();
  // Only log non-network errors to console to avoid noise.
  if (!/ECONN|ENOTFOUND|timeout|fetch failed|HTTP \d/i.test(entry.message)) {
    console.error(`[monitoring] ${context}:`, entry.message);
  }
}

// ── System health snapshot ────────────────────────────────────────────────────
function updateSystemMetrics() {
  if (typeof process === "undefined") return;
  try {
    const mem = process.memoryUsage();
    metrics.system.heapUsedMb  = Math.round(mem.heapUsed  / 1024 / 1024);
    metrics.system.heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    metrics.system.uptimeMs    = Date.now() - metrics.startedAt;
  } catch { /* ignore */ }
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function getHealthStatus() {
  updateSystemMetrics();
  let dbOk = false;
  let dbPages = 0;
  let dbQueue = 0;
  try {
    const s = await storageStats();
    dbOk    = true;
    dbPages = s?.pages || 0;
    dbQueue = s?.queue || 0;
  } catch { /* ignore */ }

  let indexerStats = {};
  try { indexerStats = getIndexerStats(); } catch { /* ignore */ }

  const heapMb = metrics.system.heapUsedMb;
  const memStatus = heapMb > 450 ? "critical" : heapMb > 350 ? "warning" : "ok";

  return {
    status: dbOk && memStatus !== "critical" ? "ok" : "degraded",
    uptime: metrics.system.uptimeMs,
    memory: {
      heapUsedMb:  metrics.system.heapUsedMb,
      heapTotalMb: metrics.system.heapTotalMb,
      status:      memStatus,
    },
    database: {
      ok:     dbOk,
      pages:  dbPages,
      queue:  dbQueue,
    },
    indexer: {
      crawled:      indexerStats.totalCrawled || 0,
      crawlsPerMin: indexerStats.crawlsPerMinute || 0,
      errors:       indexerStats.errors || 0,
    },
    search: {
      totalRequests: metrics.search.totalRequests,
      totalErrors:   metrics.search.totalErrors,
      cacheHits:     metrics.search.cacheHits,
      avgDurationMs: metrics.search.avgDurationMs,
      p95DurationMs: metrics.search.p95DurationMs,
      errorRate: metrics.search.totalRequests > 0
        ? (metrics.search.totalErrors / metrics.search.totalRequests).toFixed(4)
        : "0",
    },
    recentErrors: metrics.errors.slice(-10),
    generatedAt: new Date().toISOString(),
  };
}

// ── Full metrics dump ─────────────────────────────────────────────────────────
export function getMetrics() {
  updateSystemMetrics();
  return {
    ...metrics,
    search: { ...metrics.search, durations: undefined }, // omit raw array
    generatedAt: new Date().toISOString(),
  };
}

// ── Periodic health logging ───────────────────────────────────────────────────
let monitoringStarted = false;

export function startMonitoring() {
  if (monitoringStarted) return;
  monitoringStarted = true;

  // Log health summary every 10 minutes.
  const interval = setInterval(async () => {
    try {
      const h = await getHealthStatus();
      console.log(
        `[monitoring] status=${h.status} ` +
        `heap=${h.memory.heapUsedMb}MB ` +
        `db=${h.database.pages}pages ` +
        `searches=${h.search.totalRequests} ` +
        `avg=${h.search.avgDurationMs}ms ` +
        `crawled=${h.indexer.crawled}`
      );
      if (h.status === "degraded") {
        console.warn("[monitoring] DEGRADED:", JSON.stringify(h.recentErrors.slice(-3)));
      }
    } catch { /* ignore */ }
  }, 10 * 60 * 1000);
  interval.unref?.();
}
