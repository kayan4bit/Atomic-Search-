// ScamAdviser scraper — extracts trust scores and safety signals for domains.
// Results are cached for 24 hours per domain. Integrated as a safety signal
// in search results. Never logs user queries or IPs.

import { privateFetch, stripTags } from "../util.js";
import { parseHTML } from "linkedom";

const CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_CAP = 1000;

function cacheGet(domain) {
  const entry = CACHE.get(domain);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { CACHE.delete(domain); return null; }
  return entry.value;
}

function cacheSet(domain, value) {
  if (CACHE.size >= CACHE_CAP) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(domain, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function normaliseDomain(input) {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.toLowerCase().replace(/^www\./, "");
  }
}

// Scrape ScamAdviser for a domain's trust score and safety signals.
// Returns { domain, trustScore, trustLevel, reports, warnings, cached } or null.
export async function checkDomain(domainOrUrl) {
  if (!domainOrUrl) return null;
  const domain = normaliseDomain(domainOrUrl);
  if (!domain || domain.length < 4) return null;

  const cached = cacheGet(domain);
  if (cached) return { ...cached, cached: true };

  try {
    const url = `https://www.scamadviser.com/check-website/${encodeURIComponent(domain)}`;
    const res = await privateFetch(url, {
      timeout: 8000,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const { document } = parseHTML(html);

    // Extract trust score (0–100).
    let trustScore = null;
    const scoreEl = document.querySelector(
      ".trust-score, .trustscore, [class*='trust-score'], [class*='trustScore'], .score-value, .rating-value"
    );
    if (scoreEl) {
      const raw = stripTags(scoreEl.textContent || "").replace(/[^0-9]/g, "");
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) trustScore = n;
    }
    // Fallback: look for a number near "trust" in the page text.
    if (trustScore === null) {
      const m = html.match(/trust[^0-9]{0,30}(\d{1,3})\s*(?:\/\s*100|%|out of)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 0 && n <= 100) trustScore = n;
      }
    }

    // Classify trust level.
    let trustLevel = "unknown";
    if (trustScore !== null) {
      if (trustScore >= 80) trustLevel = "high";
      else if (trustScore >= 50) trustLevel = "medium";
      else if (trustScore >= 20) trustLevel = "low";
      else trustLevel = "very-low";
    }

    // Extract warning messages.
    const warnings = [];
    const warnEls = document.querySelectorAll(
      ".warning, .alert, [class*='warning'], [class*='alert'], .red-flag, [class*='red-flag']"
    );
    for (const el of warnEls) {
      const text = stripTags(el.textContent || "").trim();
      if (text && text.length > 10 && text.length < 200 && !warnings.includes(text)) {
        warnings.push(text);
        if (warnings.length >= 5) break;
      }
    }

    // Extract report count.
    let reports = 0;
    const reportEl = document.querySelector("[class*='report'], [class*='complaint']");
    if (reportEl) {
      const raw = stripTags(reportEl.textContent || "").replace(/[^0-9]/g, "");
      const n = parseInt(raw, 10);
      if (!isNaN(n)) reports = n;
    }

    const result = { domain, trustScore, trustLevel, reports, warnings };
    cacheSet(domain, result);
    return result;
  } catch {
    return null;
  }
}

// Batch check multiple domains. Returns a Map<domain, result>.
export async function checkDomains(domainsOrUrls) {
  if (!Array.isArray(domainsOrUrls) || !domainsOrUrls.length) return new Map();
  const results = new Map();
  // Process in parallel with a concurrency cap of 3 to be polite.
  const chunks = [];
  for (let i = 0; i < domainsOrUrls.length; i += 3) {
    chunks.push(domainsOrUrls.slice(i, i + 3));
  }
  for (const chunk of chunks) {
    const settled = await Promise.allSettled(chunk.map((d) => checkDomain(d)));
    for (let i = 0; i < chunk.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled" && r.value) {
        results.set(r.value.domain, r.value);
      }
    }
  }
  return results;
}

// Convert a ScamAdviser result into a safety signal compatible with the
// existing safety verdict format used by the rest of Atomic Search.
export function toSafetySignal(result) {
  if (!result) return null;
  const { trustScore, trustLevel, warnings } = result;
  let verdict = "unknown";
  if (trustLevel === "high") verdict = "clean";
  else if (trustLevel === "medium") verdict = "clean";
  else if (trustLevel === "low") verdict = "suspicious";
  else if (trustLevel === "very-low") verdict = "malicious";
  return {
    verdict,
    source: "scamadviser",
    trustScore,
    trustLevel,
    warnings: warnings || [],
  };
}
