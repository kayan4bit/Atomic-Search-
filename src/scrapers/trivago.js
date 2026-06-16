// Hotel search — detect hotel queries and return structured results.
// Uses the Booking.com public search page (no API key required) with
// lightweight HTML extraction. Falls back to curated static suggestions
// when scraping fails so the hotel card always renders something useful.
// v5: improved error handling, logging, and fallback data.

const CACHE = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Detect if a query is about hotels/accommodations
export function isHotelQuery(query) {
  const lower = query.toLowerCase();
  const hotelKeywords = [
    "hotel", "motel", "hostel", "airbnb", "accommodation", "lodging",
    "resort", "inn", "bed and breakfast", "bnb", "stay", "rooms",
    "booking", "where to stay", "best hotels", "cheap hotels",
  ];
  return hotelKeywords.some((kw) => lower.includes(kw));
}

// Extract a location string from a hotel query.
// "hotels in paris" → "paris", "best hotels new york" → "new york"
function extractLocation(query) {
  const lower = query.toLowerCase();
  // Strip common hotel-intent words to isolate the location.
  const stripped = lower
    .replace(/\b(best|cheap|luxury|budget|affordable|top|good|nice|great)\b/g, "")
    .replace(/\b(hotels?|motels?|hostels?|resorts?|inns?|accommodations?|lodging|rooms?|stays?|booking|airbnb|bnb)\b/g, "")
    .replace(/\b(in|at|near|around|for|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}

// Parse date strings into YYYY-MM-DD for Booking.com query params.
function parseDate(str) {
  if (!str) return null;
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

// Build a Booking.com search URL for a location + optional dates.
function buildBookingUrl(location, checkIn, checkOut) {
  const base = "https://www.booking.com/search.html";
  const params = new URLSearchParams({
    ss: location,
    lang: "en-us",
    sb: "1",
    src_elem: "sb",
    src: "searchresults",
  });
  const ci = parseDate(checkIn);
  const co = parseDate(checkOut);
  if (ci) params.set("checkin", ci);
  if (co) params.set("checkout", co);
  return `${base}?${params.toString()}`;
}

// Attempt to extract hotel cards from Booking.com HTML.
// Booking.com renders server-side for the initial page load, so basic
// regex extraction works for the first batch of results.
function parseBookingHtml(html, location) {
  const hotels = [];
  if (!html) return hotels;

  // Match property card blocks — Booking.com uses data-testid="property-card"
  // or class patterns like "sr_property_block". We try both.
  const cardRe = /data-testid="property-card"[\s\S]*?(?=data-testid="property-card"|$)/g;
  const cards = html.match(cardRe) || [];

  for (const card of cards.slice(0, 8)) {
    // Hotel name: aria-label on the title link, or h3 content
    const nameMatch =
      card.match(/aria-label="([^"]{3,80})"[^>]*data-testid="title"/) ||
      card.match(/<span[^>]*data-testid="title"[^>]*>([^<]{3,80})<\/span>/) ||
      card.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]{3,80})<\/a>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Price: look for a price element
    const priceMatch =
      card.match(/data-testid="price-and-discounted-price"[^>]*>[\s\S]*?<span[^>]*>([\$€£¥][^<]{1,20})<\/span>/) ||
      card.match(/([\$€£¥]\s*[\d,]+(?:\.\d{2})?)/);
    const price = priceMatch ? priceMatch[1].trim() : null;

    // Rating: review score
    const ratingMatch =
      card.match(/aria-label="Scored\s+([\d.]+)\s*out of/) ||
      card.match(/data-testid="review-score"[\s\S]*?<div[^>]*>([\d.]+)<\/div>/) ||
      card.match(/"reviewScore":\s*([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    // Star rating
    const starsMatch = card.match(/(\d)\s*stars?/i) || card.match(/aria-label="(\d)\s*stars?/i);
    const stars = starsMatch ? parseInt(starsMatch[1], 10) : null;

    // Link
    const linkMatch = card.match(/href="(https:\/\/www\.booking\.com\/hotel\/[^"]+)"/);
    const url = linkMatch ? linkMatch[1].split("?")[0] : buildBookingUrl(location, null, null);

    hotels.push({ name, location, price, rating, stars, url, source: "Booking.com" });
  }

  return hotels;
}

// Search hotels. Returns { results: [], searchUrl, location } or throws.
export async function searchHotels(query, opts = {}) {
  const location = extractLocation(query);
  if (!location) return { results: [], searchUrl: null, location: null };

  const cacheKey = `hotels:${location}:${opts.checkIn || ""}:${opts.checkOut || ""}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const searchUrl = buildBookingUrl(location, opts.checkIn, opts.checkOut);
  let results = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    clearTimeout(timer);

    if (res.ok) {
      const html = (await res.text()).slice(0, 800_000);
      results = parseBookingHtml(html, location);
      if (!results.length) {
        // Booking.com may have changed their HTML structure — log for debugging
        console.warn(`[hotels] Booking.com returned HTML but no results parsed for location: ${location}`);
      }
    } else {
      console.warn(`[hotels] Booking.com returned HTTP ${res.status} for location: ${location}`);
    }
  } catch (err) {
    // Network failure or timeout — fall through to fallback results.
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message || "fetch failed");
    console.warn(`[hotels] Booking.com fetch failed (${msg}) for location: ${location}`);
  }

  // Fallback: generate a helpful "search on Booking.com" result when scraping fails
  if (!results.length && location) {
    results = [{
      name: `Hotels in ${location}`,
      location,
      price: null,
      rating: null,
      stars: null,
      url: searchUrl,
      source: "Booking.com",
      isFallback: true,
    }];
  }

  const data = { results, searchUrl, location };
  if (results.length > 0) {
    CACHE.set(cacheKey, { data, ts: Date.now() });
  }
  return data;
}

// Format hotel results into a display-ready object for the search handler.
// Returns null when there are no results to avoid injecting an empty card.
export function formatHotelResults(hotelData) {
  if (!hotelData) return null;
  const hotels = Array.isArray(hotelData) ? hotelData : (hotelData.results || []);
  if (!hotels.length) return null;

  const searchUrl = hotelData.searchUrl || null;
  const location = hotelData.location || "";

  const cards = hotels
    .slice(0, 5)
    .map((h) => {
      const stars = h.stars ? "★".repeat(Math.min(5, h.stars)) : "";
      const rating = h.rating ? `<span class="hotel-rating" title="Guest score">${h.rating.toFixed(1)}</span>` : "";
      const price = h.price ? `<span class="hotel-price">${h.price}<span class="hotel-price-note">/night</span></span>` : "";
      const starsHtml = stars ? `<span class="hotel-stars" aria-label="${h.stars} stars">${stars}</span>` : "";
      return (
        `<div class="hotel-card">` +
        `<div class="hotel-card-head">` +
        `<a class="hotel-name" href="${escHtml(h.url)}" target="_blank" rel="noopener noreferrer">${escHtml(h.name)}</a>` +
        `${starsHtml}` +
        `</div>` +
        `<div class="hotel-card-meta">` +
        `${rating}${price}` +
        `<span class="hotel-location">${escHtml(h.location)}</span>` +
        `</div>` +
        `</div>`
      );
    })
    .join("");

  const moreLink = searchUrl
    ? `<a class="hotel-more-link" href="${escHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">` +
      `See all hotels in ${escHtml(location)} on Booking.com →</a>`
    : "";

  return {
    source: "Booking.com",
    html: `<div class="hotel-results">${cards}${moreLink}</div>`,
    count: hotels.length,
    location,
    searchUrl,
  };
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

