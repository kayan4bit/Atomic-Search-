// Image search aggregator — DuckDuckGo images (2-step vqd flow) + Bing images.
// Returns thumbnails + full image URLs (already proxy-wrappable on the client).
// v5: Enhanced for blazing fast image loading with lazy loading and better caching.

import { parseHTML } from "linkedom";
import { privateFetch, stripTags, uniqBy } from "./util.js";
import { isNsfwText, isNsfwUrl } from "./nsfw.js";

async function ddgImages(q) {
  try {
    // Step 1 — fetch a token (vqd).
    const pre = await privateFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      { timeout: 5000 } // v5: faster timeout
    );
    const html = await pre.text();
    const m = html.match(/vqd=['"]?(\d+-[\d-]+)['"]?/) || html.match(/vqd=([\d-]+)/);
    if (!m) return [];
    const vqd = m[1];
    const res = await privateFetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`,
      { timeout: 5000, headers: { Accept: "application/json", Referer: "https://duckduckgo.com/" } }
    );
    const data = await res.json().catch(() => ({}));
    return (data.results || []).slice(0, 50).map((r) => ({
      title: stripTags(r.title || ""),
      thumbnail: r.thumbnail,
      image: r.image,
      source: r.url,
      width: r.width,
      height: r.height,
      engine: "duckduckgo",
    }));
  } catch {
    return [];
  }
}

async function bingImages(q) {
  try {
    const res = await privateFetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2`,
      { timeout: 5000 } // v5: faster timeout
    );
    const html = await res.text();
    const { document } = parseHTML(html);
    const out = [];
    for (const el of document.querySelectorAll("a.iusc")) {
      const meta = el.getAttribute("m");
      if (!meta) continue;
      try {
        const j = JSON.parse(meta);
        if (!j.murl) continue;
        out.push({
          title: stripTags(j.t || ""),
          thumbnail: j.turl,
          image: j.murl,
          source: j.purl,
          engine: "bing",
        });
      } catch { /* ignore */ }
      if (out.length >= 50) break;
    }
    return out;
  } catch {
    return [];
  }
}

// v5: Enhanced image proxy with better caching and performance
// Proxy a thumbnail URL through our server so the browser never contacts
// upstream image CDNs. Returns a Response with the image data and correct
// MIME type, or a 404 if the image can't be fetched.
export async function proxyImageUrl(rawUrl) {
  if (!rawUrl) return new Response("Missing URL", { status: 400 });
  let url;
  try { url = new URL(rawUrl); } catch { return new Response("Invalid URL", { status: 400 }); }
  // Only allow http/https.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return new Response("Scheme not allowed", { status: 400 });
  }
  try {
    // v5: Support for better image formats and faster fetching
    const res = await privateFetch(rawUrl, {
      timeout: 8000,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Sec-Fetch-Dest": "image",
        "Cache-Control": "no-cache", // Don't cache upstream
      },
    });
    if (!res.ok) return new Response("Upstream error", { status: 502 });
    const ct = res.headers.get("content-type") || "image/jpeg";
    // Only allow image content types.
    if (!ct.startsWith("image/")) return new Response("Not an image", { status: 415 });
    
    // Read the body once and create response
    const body = await res.arrayBuffer();
    
    const headers = new Headers({
      "Content-Type": ct,
      // v5: Longer cache for images (1 hour)
      "Cache-Control": "public, max-age=3600, immutable",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      // v5: Security headers
      "X-Content-Type-Options": "nosniff",
      "Content-Length": body.byteLength.toString(),
    });
    return new Response(body, { status: 200, headers });
  } catch (e) {
    return new Response("Fetch failed: " + (e?.message || e), { status: 502 });
  }
}

// Wrap a thumbnail URL so it goes through our image proxy.
function proxyThumb(url) {
  if (!url) return null;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export async function metaImages(q) {
  if (!q || !q.trim()) return { results: [], query: q };
  const query = q.trim().slice(0, 256);
  // Short-circuit: NSFW queries get an empty result set. We don't want to
  // even hit upstream image engines with an adult query.
  if (isNsfwText(query)) return { query, results: [], filtered: true };
  
  // v5: Parallel fetch with faster timeouts
  const [a, b] = await Promise.all([
    ddgImages(query).catch(() => []),
    bingImages(query).catch(() => [])
  ]);
  
  const merged = uniqBy([...a, ...b], (r) => r.image)
    // Drop any NSFW-looking image (by source URL, image URL, or title).
    .filter((r) => {
      if (isNsfwUrl(r.image) || isNsfwUrl(r.source)) return false;
      if (isNsfwText(r.title || "")) return false;
      return true;
    })
    .slice(0, 60)
    // Route thumbnails through our proxy so the browser never contacts
    // upstream CDNs directly. The full-size image URL is kept as-is for
    // the "open original" link.
    .map((r) => ({
      ...r,
      thumbnail: proxyThumb(r.thumbnail || r.image),
      // Keep the original image URL for the source link.
      originalImage: r.image,
    }));
  return { query, results: merged };
}
