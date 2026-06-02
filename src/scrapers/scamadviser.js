// ScamAdviser integration — check domains for scam/fraud indicators
// Lightweight scraper that queries ScamAdviser's public API

const SCAMADVISER_API = "https://www.scamadviser.com/api/v3/domain/check";
const CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function checkDomain(domain) {
  if (!domain) return null;
  
  // Check cache first
  const cached = CACHE.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`${SCAMADVISER_API}?domain=${encodeURIComponent(domain)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0)",
      },
      timeout: 5000,
    });

    if (!response.ok) return null;
    const data = await response.json();

    // Cache the result
    CACHE.set(domain, { data, timestamp: Date.now() });

    return {
      domain,
      trustScore: data.trust_score || 0, // 0-100, higher is safer
      riskLevel: getRiskLevel(data.trust_score),
      isBlacklisted: data.blacklisted || false,
      reports: data.reports || 0,
      lastChecked: new Date().toISOString(),
      url: `https://www.scamadviser.com/check-website/${domain}`,
    };
  } catch (err) {
    console.error("ScamAdviser check failed:", err?.message);
    return null;
  }
}

function getRiskLevel(score) {
  if (score >= 80) return "SAFE";
  if (score >= 60) return "CAUTION";
  if (score >= 40) return "WARNING";
  return "DANGER";
}

// Batch check multiple domains
export async function checkDomains(domains) {
  const results = await Promise.all(
    domains.map((d) => checkDomain(d).catch(() => null))
  );
  return results.filter(Boolean);
}

// Check if a URL is suspicious based on domain analysis
export async function isSuspiciousUrl(url) {
  try {
    const domain = new URL(url).hostname;
    const check = await checkDomain(domain);
    if (!check) return false;
    return check.riskLevel === "DANGER" || check.riskLevel === "WARNING";
  } catch {
    return false;
  }
}

