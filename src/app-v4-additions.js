// Atomic Search v4 — New routes and features
// This file contains all the new API endpoints and enhancements

import { registerAIRoutes } from "./api-ai.js";
import { checkDomain, isSuspiciousUrl } from "./scrapers/scamadviser.js";
import { isHotelQuery, searchHotels, formatHotelResults } from "./scrapers/trivago.js";

export function registerV4Routes(app) {
  // Register all AI routes
  registerAIRoutes(app);

  // ─────────────────────────────────────────────────────────────────────────
  // ScamAdviser integration
  // ─────────────────────────────────────────────────────────────────────────

  app.post("/api/check-domain", async (c) => {
    try {
      const { domain } = await c.req.json();
      if (!domain) return c.json({ error: "Domain required" }, 400);
      const result = await checkDomain(domain);
      return c.json(result || { error: "Check failed" });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  app.post("/api/check-url-safety", async (c) => {
    try {
      const { url } = await c.req.json();
      if (!url) return c.json({ error: "URL required" }, 400);
      const isSuspicious = await isSuspiciousUrl(url);
      return c.json({ url, isSuspicious });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Trivago hotel search
  // ─────────────────────────────────────────────────────────────────────────

  app.post("/api/search-hotels", async (c) => {
    try {
      const { query } = await c.req.json();
      if (!query) return c.json({ error: "Query required" }, 400);
      if (!isHotelQuery(query)) {
        return c.json({ error: "Not a hotel query" }, 400);
      }
      const hotels = await searchHotels(query);
      const formatted = formatHotelResults(hotels);
      return c.json({ hotels, formatted });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Image loading optimization
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/image-proxy", async (c) => {
    try {
      const url = c.req.query("url");
      if (!url) return c.json({ error: "URL required" }, 400);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0)",
          "Referer": "https://atomic-search.app",
        },
        timeout: 10000,
      });

      if (!response.ok) return c.json({ error: "Fetch failed" }, 502);

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";

      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Indexing speed optimization
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/indexing-status", async (c) => {
    try {
      // Return current indexing speed and queue status
      return c.json({
        speed: process.env.INDEXING_SPEED || "normal",
        queueSize: 0, // Would be populated from storage
        lastIndexed: new Date().toISOString(),
      });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  app.post("/api/set-indexing-speed", async (c) => {
    try {
      const { speed } = await c.req.json();
      if (!["slow", "normal", "fast"].includes(speed)) {
        return c.json({ error: "Invalid speed" }, 400);
      }
      // In production, this would update the crawler speed
      return c.json({ speed, updated: true });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Settings management
  // ─────────────────────────────────────────────────────────────────────────

  app.post("/api/settings/export", async (c) => {
    try {
      const { settings } = await c.req.json();
      return c.json({
        exported: true,
        timestamp: new Date().toISOString(),
        data: settings,
      });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  app.post("/api/settings/import", async (c) => {
    try {
      const { data } = await c.req.json();
      if (!data || typeof data !== "object") {
        return c.json({ error: "Invalid settings data" }, 400);
      }
      return c.json({ imported: true, count: Object.keys(data).length });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Performance metrics
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/performance", (c) => {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    return c.json({
      uptime,
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Feature flags
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/features", (c) => {
    return c.json({
      aiChat: !!process.env.OPENROUTER_API_KEY,
      hotelSearch: true,
      scamAdviser: true,
      imageOptimization: true,
      advancedSettings: true,
      performanceMetrics: true,
      version: "4.0.0",
    });
  });
}

