// Trivago scraper — extracts hotel/accommodation listings without sponsored
// results. Respects robots.txt intent (no aggressive crawling), rate-limited,
// and cached for 2 hours. Only activated for vacation/hotel-related queries.

import { privateFetch, stripTags } from "../util.js";
import { parseHTML } from "linkedom";

const CACHE = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const CACHE_CAP = 200;
const RATE_LIMIT_MS = 2000; // minimum 2s between requests
let _lastRequest = 0;

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { CACHE.delete(key); return null; }
  return entry.value;
}

function cacheSet(key, value) {
  if (CACHE.size >= CACHE_CAP) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function rateLimit() {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - _lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastRequest = Date.now();
}

// Detect if a query is hotel/vacation related.
export function isHotelQuery(query) {
  if (!query) return false;
  const lower = query.toLowerCase();
  return /\b(hotel|hotels|motel|hostel|resort|inn|lodge|accommodation|stay|room|booking|trivago|airbnb|vacation|holiday|trip|travel|flight|destination)\b/.test(lower);
}

// Scrape Trivago search results for a location query.
// Returns { query, results: [{ name, price, rating, location, url, sponsored }], cached }
// Sponsored results are filtered out.
export async function searchHotels(query, { location = "", checkIn = "", checkOut = "" } = {}) {
  if (!query) return { query, results: [] };
  const cacheKey = `trivago:${query}:${location}:${checkIn}:${checkOut}`.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  await rateLimit();

  try {
    const searchTerm = [query, location].filter(Boolean).join(" ");
    const url = `https://www.trivago.com/en-US/srl?search[dest]=${encodeURIComponent(searchTerm)}&search[ci]=${encodeURIComponent(checkIn)}&search[co]=${encodeURIComponent(checkOut)}`;

    const res = await privateFetch(url, {
      timeout: 10000,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return { query, results: [] };
    const html = await res.text();
    const { document } = parseHTML(html);

    const results = [];
    // Trivago uses various selectors depending on layout version.
    const cards = document.querySelectorAll(
      "[data-testid='accommodation-list-element'], .hotel-item, .item-container, article[class*='hotel'], [class*='accommodation-item']"
    );

    for (const card of cards) {
      // Skip sponsored/promoted listings.
      const isSponsored = !!(
        card.querySelector("[class*='sponsored'], [class*='promoted'], [data-testid*='sponsored'], [data-testid*='promoted']") ||
        card.getAttribute("data-sponsored") === "true" ||
        card.getAttribute("data-promoted") === "true" ||
        /sponsored|promoted/i.test(card.getAttribute("class") || "")
      );
      if (isSponsored) continue;

      const nameEl = card.querySelector(
        "[data-testid='item-name'], .hotel-name, h3, h2, [class*='hotel-name'], [class*='property-name']"
      );
      const name = nameEl ? stripTags(nameEl.textContent || "").trim() : null;
      if (!name || name.length < 2) continue;

      const priceEl = card.querySelector(
        "[data-testid='recommended-price'], .price, [class*='price'], [class*='rate']"
      );
      const priceRaw = priceEl ? stripTags(priceEl.textContent || "").trim() : null;
      const price = priceRaw ? priceRaw.replace(/\s+/g, " ").slice(0, 50) : null;

      const ratingEl = card.querySelector(
        "[data-testid='rating-score'], .rating, [class*='rating'], [class*='score']"
      );
      let rating = null;
      if (ratingEl) {
        const ratingText = stripTags(ratingEl.textContent || "").replace(/[^0-9.]/g, "");
        const n = parseFloat(ratingText);
        if (!isNaN(n) && n > 0 && n <= 10) rating = n;
      }

      const locationEl = card.querySelector(
        "[data-testid='item-location'], .location, [class*='location'], [class*='address']"
      );
      const locationText = locationEl ? stripTags(locationEl.textContent || "").trim().slice(0, 100) : null;

      const linkEl = card.querySelector("a[href]");
      let hotelUrl = null;
      if (linkEl) {
        const href = linkEl.getAttribute("href") || "";
        try {
          hotelUrl = new URL(href, "https://www.trivago.com").toString();
        } catch { /* ignore */ }
      }

      results.push({
        name,
        price,
        rating,
        location: locationText,
        url: hotelUrl,
        sponsored: false,
      });
      if (results.length >= 20) break;
    }

    const out = { query, results };
    if (results.length > 0) cacheSet(cacheKey, out);
    return out;
  } catch {
    return { query, results: [] };
  }
}

// Format hotel results for inclusion in search results.
export function formatHotelResults(trivagoData) {
  if (!trivagoData?.results?.length) return [];
  return trivagoData.results.map((h) => ({
    url: h.url || `https://www.trivago.com/en-US/srl?search[dest]=${encodeURIComponent(h.name || "")}`,
    title: h.name || "Hotel",
    snippet: [
      h.location ? `📍 ${h.location}` : null,
      h.price ? `💰 ${h.price}` : null,
      h.rating ? `⭐ ${h.rating}/10` : null,
    ].filter(Boolean).join("  ·  "),
    host: "trivago.com",
    engine: "trivago",
    engines: ["trivago"],
    score: h.rating ? h.rating / 10 : 0.5,
    ownIndex: false,
    isHotelResult: true,
  }));
}
