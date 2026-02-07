// F1 Catchup - Stremio Catalog & Meta Provider
// Sources episode data directly from TheTVDB API v4 (Series ID 387219)

const TVDB_SERIES_ID = 387219;
const TVDB_API_BASE = "https://api4.thetvdb.com/v4";

// --- Image Paths ---
const IMAGE_POSTER_PATH = "/images/poster.png";
const IMAGE_LOGO_PATH = "/images/logo.png";
const IMAGE_BG_PATH = "/images/background.jpg";

// --- TVDB Auth ---

async function getTvdbToken(apiKey, ctx) {
    const cacheKey = `tvdb-token-${apiKey}`;

    try {
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) {
            const data = await cached.json();
            return data.token;
        }
    } catch (e) {
        console.warn("Token cache read failed:", e);
    }

    const response = await fetch(`${TVDB_API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: apiKey })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`TVDB login failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    const token = data.data.token;

    // Cache token for 20 hours (TVDB tokens last 24h)
    try {
        const cache = caches.default;
        const cacheableResponse = new Response(JSON.stringify({ token }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=72000"
            }
        });
        ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));
    } catch (e) {
        console.warn("Token cache write failed:", e);
    }

    return token;
}

// --- TVDB Episodes ---

async function fetchTvdbEpisodes(token, ctx) {
    const cacheKey = `tvdb-episodes-${TVDB_SERIES_ID}`;

    try {
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) return cached.json();
    } catch (e) {
        console.warn("Episodes cache read failed:", e);
    }

    const allEpisodes = [];
    let page = 0;

    while (true) {
        const url = `${TVDB_API_BASE}/series/${TVDB_SERIES_ID}/episodes/default?page=${page}`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`TVDB episodes fetch failed (${response.status})`);
        }

        const data = await response.json();
        const episodes = data.data?.episodes || [];
        allEpisodes.push(...episodes);

        if (!data.links?.next) break;
        page++;
    }

    // Cache for 24 hours
    try {
        const cache = caches.default;
        const cacheableResponse = new Response(JSON.stringify(allEpisodes), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=86400"
            }
        });
        ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));
    } catch (e) {
        console.warn("Episodes cache write failed:", e);
    }

    return allEpisodes;
}

// --- Stremio Handlers ---

function getManifest(images, isConfigured = false) {
    const manifest = {
        id: "org.f1catchup.catalog",
        version: "2.0.0",
        name: "F1 Catchup",
        description: "Formula 1 sessions mapped to TheTVDB for accurate stream matching via addons like Torrentio.",
        logo: images.logo,
        background: images.background,
        resources: ["catalog", "meta"],
        types: ["series"],
        catalogs: [{
            type: "series",
            id: "f1-catchup-catalog",
            name: "Formula 1",
            extra: [{ name: "skip", isRequired: false }]
        }],
        idPrefixes: ["tvdb:"],
        behaviorHints: { configurable: true },
        config: [
            {
                key: "tvdbApiKey",
                type: "text",
                title: "TVDB API Key",
                required: true
            }
        ]
    };

    // Only require configuration if not already configured
    if (!isConfigured) {
        manifest.behaviorHints.configurationRequired = true;
    }

    return manifest;
}

async function handleCatalog(images) {
    return {
        metas: [{
            id: `tvdb:${TVDB_SERIES_ID}`,
            type: "series",
            name: "Formula 1",
            poster: images.poster,
            background: images.background,
            description: "Formula 1 World Championship\nAll practice sessions, qualifying, and races.",
            releaseInfo: "1950-",
            genres: ["Motorsport", "Racing", "Formula 1"],
            logo: images.logo
        }]
    };
}

async function handleMeta(id, apiKey, ctx, images) {
    if (id !== `tvdb:${TVDB_SERIES_ID}`) return { meta: null };

    const token = await getTvdbToken(apiKey, ctx);
    const episodes = await fetchTvdbEpisodes(token, ctx);

    const videos = episodes.map(ep => ({
        id: `tvdb:${TVDB_SERIES_ID}:${ep.seasonNumber}:${ep.number}`,
        title: ep.name || `Episode ${ep.number}`,
        season: ep.seasonNumber,
        episode: ep.number,
        released: ep.aired ? `${ep.aired}T00:00:00.000Z` : undefined,
        overview: ep.overview || "",
        thumbnail: ep.image || undefined
    }));

    return {
        meta: {
            id,
            type: "series",
            name: "Formula 1",
            poster: images.poster,
            background: images.background,
            description: "Formula 1 World Championship. All practice sessions, qualifying, and races.",
            genres: ["Motorsport", "Racing", "Formula 1"],
            logo: images.logo,
            videos
        }
    };
}

// --- Response Helper ---

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

// --- Main Handler ---

export async function onRequest(ctx) {
    const url = new URL(ctx.request.url);
    const path = url.pathname;

    if (ctx.request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    const pathParts = path.split("/").filter(Boolean);
    const origin = url.origin;
    const images = {
        poster: origin + IMAGE_POSTER_PATH,
        logo: origin + IMAGE_LOGO_PATH,
        background: origin + IMAGE_BG_PATH
    };

    try {
        // Unconfigured manifest at /manifest.json
        if (path === "/manifest.json" || (pathParts.length === 1 && pathParts[0] === "manifest.json")) {
            return jsonResponse(getManifest(images));
        }

        // Configured paths: /{tvdbApiKey}/manifest.json, /{tvdbApiKey}/catalog/..., /{tvdbApiKey}/meta/...
        const firstPart = pathParts[0];
        const isResource = ["catalog", "meta", "manifest.json"].includes(firstPart);

        let apiKey = null;
        let resourceParts = pathParts;

        if (!isResource && pathParts.length >= 2) {
            apiKey = firstPart;
            resourceParts = pathParts.slice(1);
        }

        // Configured manifest - API key is in the URL, so addon is configured
        if (resourceParts[0] === "manifest.json") {
            return jsonResponse(getManifest(images, !!apiKey));
        }

        // Find resource in remaining parts
        const resourceIndex = resourceParts.findIndex(p => p === "catalog" || p === "meta");

        if (resourceIndex !== -1) {
            const resource = resourceParts[resourceIndex];
            const id = resourceParts[resourceIndex + 2]?.replace(".json", "");

            if (resource === "catalog") {
                return jsonResponse(await handleCatalog(images));
            }

            if (resource === "meta" && id) {
                if (!apiKey) {
                    return jsonResponse({ error: "TVDB API key required. Please configure the addon." }, 401);
                }
                return jsonResponse(await handleMeta(decodeURIComponent(id), apiKey, ctx, images));
            }
        }

        return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
        console.error("Request error:", error);
        return jsonResponse({ error: "Internal server error", message: error.message }, 500);
    }
}