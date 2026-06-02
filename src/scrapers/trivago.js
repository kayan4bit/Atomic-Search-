// Trivago hotel scraper — detect hotel queries and fetch results
// Scrapes without sponsor/affiliate links

const TRIVAGO_SEARCH = "https://www.trivago.com/en/s/";
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

// Search hotels on Trivago (lightweight scrape)
export async function searchHotels(query) {
  const cacheKey = `hotels:${query}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Parse location from query (e.g., "hotels in paris" → "paris")
    const location = extractLocation(query);
    if (!location) return [];

    const url = `${TRIVAGO_SEARCH}${encodeURIComponent(location)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0)",
      },
      timeout: 8000,
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Parse hotel results from HTML (lightweight regex-based extraction)
    const hotels = parseHotels(html, location);

    // Cache results
    CACHE.set(cacheKey, { data: hotels, timestamp: Date.now() });
    return hotels;
  } catch (err) {
    console.error("Trivago search failed:", err?.message);
    return [];
  }
}

function extractLocation(query) {
  // Simple extraction: "hotels in paris" → "paris"
  const match = query.match(/(?:in|at|near|around)\s+([a-z\s]+?)(?:\s+(?:hotels?|accommodations?|rooms?|stays?|booking))?$/i);
  if (match) return match[1].trim();
  
  // Fallback: last 2-3 words
  const words = query.split(/\s+/).filter((w) => w.length > 2);
  return words.slice(-2).join(" ");
}

function parseHotels(html, location) {
  const hotels = [];
  
  // Extract hotel cards from HTML (simplified regex)
  const hotelPattern = /<div[^>]*class="[^"]*hotel[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  const matches = html.match(hotelPattern) || [];

  for (const match of matches.slice(0, 10)) {
    const nameMatch = match.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i);
    const priceMatch = match.match(/\$?([\d,]+)/);
    const ratingMatch = match.match(/(\d+\.?\d*)\s*(?:star|★)/i);

    if (nameMatch) {
      hotels.push({
        name: nameMatch[1].trim(),
        location,
        price: priceMatch ? priceMatch[1] : "N/A",
        rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
        url: `https://www.trivago.com/en/s/${encodeURIComponent(location)}`,
      });
    }
  }

  return hotels;
}

// Format hotel results for display
export function formatHotelResults(hotels) {
  if (!hotels?.length) return null;

  const html = hotels
    .map(
      (h) =>
        `<div class="hotel-card">
          <h4>${h.name}</h4>
          <p>${h.location}</p>
          ${h.rating ? `<span class="rating">★ ${h.rating}</span>` : ""}
          <span class="price">$${h.price}</span>
          <a href="${h.url}" target="_blank" rel="noopener">View on Trivago</a>
        </div>`
    )
    .join("");

  return {
    source: "Trivago",
    html,
    count: hotels.length,
  };
}

