// F1 Catchup - Cloudflare Pages Function
// Fixed version with corrected Torbox Voyager Search API endpoints

const F1_API = "https://api.jolpi.ca/ergast/f1";
const OPENF1_API = "https://api.openf1.org/v1";
const TORBOX_API = "https://api.torbox.app/v1/api";
const TORBOX_SEARCH_API = "https://search-api.torbox.app";

// Country codes for flags
const COUNTRY_FLAGS = {
    "australia": "au", "china": "cn", "japan": "jp", "bahrain": "bh",
    "saudi arabia": "sa", "usa": "us", "united states": "us", "italy": "it",
    "monaco": "mc", "spain": "es", "canada": "ca", "austria": "at",
    "uk": "gb", "great britain": "gb", "united kingdom": "gb",
    "belgium": "be", "hungary": "hu",
    "netherlands": "nl", "azerbaijan": "az", "singapore": "sg", "mexico": "mx",
    "brazil": "br", "qatar": "qa", "uae": "ae", "abu dhabi": "ae", "united arab emirates": "ae",
    "portugal": "pt", "turkey": "tr", "turkiye": "tr",
    "russia": "ru", "germany": "de",
    "france": "fr", "malaysia": "my", "korea": "kr", "south korea": "kr",
    "india": "in", "vietnam": "vn",
    "las vegas": "us", "miami": "us", "emilia romagna": "it", "imola": "it",
    "south africa": "za", "thailand": "th", "argentina": "ar",
    "switzerland": "ch", "sweden": "se", "morocco": "ma", "rwanda": "rw",
};

const getFlagUrl = (country) => {
    const normalized = country.toLowerCase().trim();
    const code = COUNTRY_FLAGS[normalized] || "un";
    return "https://flagcdn.com/w320/" + code + ".png";
};

// Session definitions
const SESSION_DEFS = [
    { apiField: "FirstPractice",    id: "fp1",          name: "FP1",               searchTerm: "Practice 1" },
    { apiField: "SecondPractice",   id: "fp2",          name: "FP2",               searchTerm: "Practice 2" },
    { apiField: "ThirdPractice",    id: "fp3",          name: "FP3",               searchTerm: "Practice 3" },
    { apiField: "SprintQualifying", id: "sprintquali",  name: "Sprint Qualifying", searchTerm: "Sprint Qualifying" },
    { apiField: "Sprint",           id: "sprint",       name: "Sprint",            searchTerm: "Sprint" },
    { apiField: "Qualifying",       id: "qualifying",   name: "Qualifying",        searchTerm: "Qualifying" },
];

const RACE_SESSION = { id: "grandprix", name: "Grand Prix", searchTerm: "Race" };
const ALL_SESSION_DEFS = [...SESSION_DEFS, RACE_SESSION];

// Image paths
const IMAGE_POSTER_PATH = "/images/poster.png";
const IMAGE_LOGO_PATH = "/images/logo.png";
const IMAGE_BG_PATH = "/images/background.jpg";

// Determine which sessions exist for a given race
function getSessionsForRace(race) {
    const sessions = [];
    for (const def of SESSION_DEFS) {
        if (race[def.apiField]) {
            sessions.push({
                id: def.id,
                name: def.name,
                searchTerm: def.searchTerm,
                date: race[def.apiField].date,
                time: race[def.apiField].time
            });
        }
    }
    sessions.push({
        id: RACE_SESSION.id,
        name: RACE_SESSION.name,
        searchTerm: RACE_SESSION.searchTerm,
        date: race.date,
        time: race.time
    });
    return sessions;
}

// Helper to format date/time properly for Stremio
function formatReleaseDate(date, time, fallbackYear) {
    if (!date) {
        return fallbackYear + "-01-01T00:00:00.000Z";
    }
    
    if (time) {
        var cleanTime = time.replace(/Z$/, "");
        if (cleanTime.match(/[+-]\d{2}:\d{2}$/)) {
            return date + "T" + cleanTime;
        }
        return date + "T" + cleanTime + "Z";
    }
    
    return date + "T00:00:00.000Z";
}

// Fetch with caching
async function fetchWithCache(url, cacheKey, ctx, ttl = 86400) {
    try {
        const cache = caches.default;
        const cacheResponse = await cache.match(cacheKey);
        if (cacheResponse) {
            return cacheResponse.json();
        }
    } catch (cacheErr) {
        console.warn("Cache read failed:", cacheErr);
    }

    const response = await fetch(url, {
        headers: {
            "User-Agent": "F1CatchupAddon/0.2.0"
        }
    });

    if (!response.ok) {
        throw new Error("API returned " + response.status + ": " + response.statusText);
    }

    const data = await response.json();

    try {
        const cache = caches.default;
        const cacheableResponse = new Response(JSON.stringify(data), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=" + ttl
            }
        });
        ctx.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));
    } catch (cacheErr) {
        console.warn("Cache write failed:", cacheErr);
    }

    return data;
}

// Get seasons
async function getSeasons(ctx) {
    const currentYear = new Date().getFullYear();
    const openF1Years = [];
    for (var y = currentYear; y >= 2023; y--) {
        openF1Years.push(y);
    }
    const legacyYears = [2022, 2021, 2020];
    return [...openF1Years, ...legacyYears];
}

// OpenF1 Calendar
async function getOpenF1Calendar(year, ctx) {
    try {
        const [meetings, sessions] = await Promise.all([
            fetchWithCache(OPENF1_API + "/meetings?year=" + year, "openf1-meetings-" + year, ctx),
            fetchWithCache(OPENF1_API + "/sessions?year=" + year, "openf1-sessions-" + year, ctx)
        ]);

        if (!meetings || !sessions) return [];

        meetings.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

        const testingEvents = meetings.filter(m => {
            const name = m.meeting_name.toLowerCase();
            return name.includes("testing") || name.includes("test");
        });
        
        const raceWeekends = meetings.filter(m => {
            const name = m.meeting_name.toLowerCase();
            return !name.includes("testing") && !name.includes("test");
        });

        const results = [];
        
        testingEvents.forEach((meeting, testIndex) => {
            const meetingSessions = sessions.filter(s => s.meeting_key === meeting.meeting_key);
            meetingSessions.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
            
            const testingSessions = [];
            meetingSessions.forEach((s, idx) => {
                const start = new Date(s.date_start);
                const dateStr = start.toISOString().split("T")[0];
                const timeStr = start.toISOString().split("T")[1].split(".")[0];
                
                testingSessions.push({
                    id: "test" + (idx + 1),
                    name: s.session_name,
                    searchTerm: "Testing " + s.session_name,
                    date: dateStr,
                    time: timeStr
                });
            });
            
            const firstSession = meetingSessions[0];
            const startDate = firstSession ? new Date(firstSession.date_start) : new Date(meeting.date_start);
            
            results.push({
                round: 0,
                isTesting: true,
                name: meeting.meeting_name,
                circuit: meeting.circuit_short_name,
                location: meeting.location,
                country: meeting.country_name || meeting.location,
                countryFlag: meeting.country_flag,
                date: startDate.toISOString().split("T")[0],
                time: startDate.toISOString().split("T")[1].split(".")[0],
                testingSessions: testingSessions
            });
        });

        raceWeekends.forEach((meeting, index) => {
            const meetingSessions = sessions.filter(s => s.meeting_key === meeting.meeting_key);
            const raceSession = meetingSessions.find(s => s.session_name === "Race") || {};
            
            const sessionMap = {};
            meetingSessions.forEach(s => {
                const start = new Date(s.date_start);
                const dateStr = start.toISOString().split("T")[0];
                const timeStr = start.toISOString().split("T")[1].split(".")[0];

                var type = null;
                const name = s.session_name.toLowerCase();
                
                if (name.includes("practice 1")) type = "FirstPractice";
                else if (name.includes("practice 2")) type = "SecondPractice";
                else if (name.includes("practice 3")) type = "ThirdPractice";
                else if (name === "qualifying") type = "Qualifying";
                else if (name === "sprint") type = "Sprint";
                else if (name === "sprint qualifying" || name === "sprint shootout") type = "SprintQualifying";

                if (type) {
                    sessionMap[type] = { date: dateStr, time: timeStr };
                }
            });

            const raceDateStart = raceSession.date_start ? new Date(raceSession.date_start) : new Date(meeting.date_start);
            
            results.push({
                round: index + 1,
                name: meeting.meeting_name,
                circuit: meeting.circuit_short_name,
                location: meeting.location,
                country: meeting.country_name || meeting.location,
                countryFlag: meeting.country_flag,
                date: raceDateStart.toISOString().split("T")[0],
                time: raceDateStart.toISOString().split("T")[1].split(".")[0],
                ...sessionMap
            });
        });

        return results;
    } catch (e) {
        console.error("OpenF1 fetch error for " + year + ":", e);
        return [];
    }
}

// Get calendar for a season
async function getCalendar(year, ctx) {
    if (year >= 2023) {
        return getOpenF1Calendar(year, ctx);
    }

    try {
        const cacheKey = "https://f1catchup-cache/calendar/" + year;
        const data = await fetchWithCache(
            F1_API + "/" + year + ".json?limit=100",
            cacheKey,
            ctx
        );

        if (!data || !data.MRData) return [];

        return data.MRData.RaceTable.Races.map(race => ({
            round: parseInt(race.round),
            name: race.raceName,
            circuit: race.Circuit.circuitName,
            location: race.Circuit.Location.country,
            date: race.date,
            time: race.time,
            FirstPractice: race.FirstPractice,
            SecondPractice: race.SecondPractice,
            ThirdPractice: race.ThirdPractice,
            Qualifying: race.Qualifying,
            Sprint: race.Sprint,
            SprintQualifying: race.SprintQualifying
        }));
    } catch (error) {
        console.error("Failed to fetch " + year + " calendar:", error);
        return [];
    }
}

// Search Torbox - Using the Voyager Search API (search-api.torbox.app)
// Searches both torrents and usenet endpoints for maximum coverage
// Note: Search is restricted to paid TorBox users only (Usenet may require Pro tier)
async function searchTorbox(query, apiKey) {
    if (!apiKey) return { torrents: [], error: "No API key provided" };

    // Search both torrents and usenet endpoints in parallel
    // API uses path-based queries: /torrents/search/{query} NOT ?query=
    const endpoints = [
        {
            name: "Torrents",
            url: TORBOX_SEARCH_API + "/torrents/search/" + encodeURIComponent(query),
            type: "torrent"
        },
        {
            name: "Usenet",
            url: TORBOX_SEARCH_API + "/usenet/search/" + encodeURIComponent(query),
            type: "usenet"
        }
    ];

    const headers = { 
        "Authorization": "Bearer " + apiKey,
        "User-Agent": "F1CatchupAddon/0.2.0",
        "Content-Type": "application/json"
    };

    // Fetch all endpoints in parallel
    const fetchPromises = endpoints.map(async (endpoint) => {
        try {
            const response = await fetch(endpoint.url, { headers });

            // Handle auth errors
            if (response.status === 401 || response.status === 403) {
                console.error("Auth error from " + endpoint.name + ":", response.status);
                return { endpoint: endpoint.name, type: endpoint.type, results: [], authError: true };
            }

            if (!response.ok) {
                console.error("HTTP error from " + endpoint.name + ":", response.status);
                return { endpoint: endpoint.name, type: endpoint.type, results: [], error: response.status };
            }

            const data = await response.json();
            let results = [];
            
            // Flexible parsing for different Torbox response structures
            if (data.data && Array.isArray(data.data.torrents)) {
                results = data.data.torrents;
            } else if (data.data && Array.isArray(data.data.nzbs)) {
                results = data.data.nzbs;
            } else if (data.data && Array.isArray(data.data)) {
                results = data.data;
            } else if (Array.isArray(data.torrents)) {
                results = data.torrents;
            } else if (Array.isArray(data.nzbs)) {
                results = data.nzbs;
            } else if (Array.isArray(data)) {
                results = data;
            }
            
            // Tag results with their source type
            results = results.map(r => ({ ...r, _sourceType: endpoint.type }));
            
            return { endpoint: endpoint.name, type: endpoint.type, results, authError: false };
        } catch (error) {
            console.error("Search error for " + endpoint.name + ":", error.message || error);
            return { endpoint: endpoint.name, type: endpoint.type, results: [], error: error.message };
        }
    });

    const responses = await Promise.all(fetchPromises);
    
    // Check if all endpoints returned auth errors
    const allAuthErrors = responses.every(r => r.authError);
    if (allAuthErrors) {
        return { torrents: [], error: "invalid_api_key", detail: "Search requires a paid TorBox subscription" };
    }

    // Combine results from all endpoints
    const allResults = [];
    const seenIds = new Set();
    const successfulEndpoints = [];

    for (const response of responses) {
        if (response.results.length > 0) {
            successfulEndpoints.push(response.endpoint);
            for (const result of response.results) {
                // Deduplicate by hash or nzb_id
                const id = result.hash || result.nzb_id || result.id || (result.raw_title + result.size);
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    allResults.push(result);
                }
            }
        }
    }

    if (allResults.length > 0) {
        return { 
            torrents: allResults, 
            error: null, 
            endpoint: successfulEndpoints.join(" + ") 
        };
    }
    
    return { torrents: [], error: "No results found", endpoint: "none" };
}

// Generate manifest
function getManifest(images) {
    return {
        id: "com.f1catchup.addon",
        version: "0.3.0",
        name: "F1 Catchup",
        description: "Formula 1 sessions with Torbox - Torrents + Usenet (requires paid Torbox subscription)",
        logo: images.logo,
        background: images.background,
        resources: ["catalog", "meta", "stream"],
        types: ["series"],
        catalogs: [{
            type: "series",
            id: "f1-catchup-catalog",
            name: "F1 Catchup",
            extra: [{ name: "skip", isRequired: false }]
        }],
        idPrefixes: ["f1catchup:"]
    };
}

// Handle catalog request
async function handleCatalog(ctx, images) {
    const seasons = await getSeasons(ctx);
    const metas = seasons.map(year => ({
        id: "f1catchup:season:" + year,
        type: "series",
        name: "Season " + year,
        poster: images.poster,
        background: images.background,
        description: "Formula 1 " + year + " World Championship\nAll practice sessions, qualifying, and races",
        releaseInfo: "" + year,
        genres: ["Motorsport", "Racing", "Formula 1"],
        logo: images.logo
    }));
    return { metas: metas };
}

// Handle meta request
async function handleMeta(id, ctx, images) {
    if (!id.startsWith("f1catchup:season:")) return { meta: null };

    const year = parseInt(id.split(":")[2]);
    const races = await getCalendar(year, ctx);
    if (!races.length) return { meta: null };

    const videos = [];
    var episodeCounter = 1;
    races.sort((a, b) => a.round - b.round);

    races.forEach(race => {
        const countryName = race.country || race.location;
        if (race.isTesting && race.testingSessions) {
            race.testingSessions.forEach((session) => {
                videos.push({
                    id: "f1catchup:" + year + ":0:" + session.id,
                    title: year + " " + race.location + " " + session.name,
                    season: 1,
                    episode: 0,
                    released: formatReleaseDate(session.date, session.time, year),
                    overview: "Pre-Season Testing",
                    thumbnail: getFlagUrl(countryName)
                });
            });
            return;
        }
        
        const sessions = getSessionsForRace(race);
        const location = race.location || race.country || "Unknown";
        sessions.forEach((session) => {
            videos.push({
                id: "f1catchup:" + year + ":" + race.round + ":" + session.id,
                title: year + " " + location + " " + session.name,
                season: 1,
                episode: episodeCounter,
                released: formatReleaseDate(session.date, session.time, year),
                overview: "Round " + race.round + " - " + race.name,
                thumbnail: getFlagUrl(countryName)
            });
            episodeCounter++;
        });
    });

    videos.sort((a, b) => a.episode - b.episode);
    return {
        meta: {
            id: id,
            type: "series",
            name: "Season " + year,
            poster: images.poster,
            background: images.background,
            description: "Formula 1 " + year + " World Championship\nAll practice sessions, qualifying, and races",
            releaseInfo: "" + year,
            genres: ["Motorsport", "Racing", "Formula 1"],
            logo: images.logo,
            videos: videos
        }
    };
}

// Handle stream request
async function handleStream(id, apiKey, ctx) {
    if (!id.startsWith("f1catchup:")) return { streams: [] };

    const parts = id.split(":");
    const year = parts[1];
    const round = parseInt(parts[2]);
    const session = parts[3];

    const races = await getCalendar(year, ctx);
    const race = races.find(r => r.round === round);
    if (!race) return { streams: [] };

    const sessionDef = ALL_SESSION_DEFS.find(d => d.id === session);
    const sessionName = sessionDef ? sessionDef.searchTerm : session;
    const sessionDisplayName = sessionDef ? sessionDef.name : session;
    const paddedRound = String(round).padStart(2, "0");
    const raceName = race.name.replace(" Grand Prix", "").replace(" Prix", "");

    // Optimized search queries for F1 content
    const searchQueries = [
        "Formula 1 " + year + " Round " + paddedRound + " " + race.location + " " + sessionName,
        "F1 " + year + " R" + paddedRound + " " + sessionName,
        "Formula 1 " + year + " " + raceName + " " + sessionName,
        "F1 " + year + " " + race.location + " " + sessionName,
    ];

    const searchPromises = searchQueries.map(query => searchTorbox(query, apiKey));
    const searchResults = await Promise.allSettled(searchPromises);
    const streams = [];
    const seenIds = new Set();
    var apiKeyError = false;
    var subscriptionError = false;

    for (const result of searchResults) {
        if (result.status !== "fulfilled") continue;
        const { torrents, error, detail } = result.value;
        
        if (error === "invalid_api_key") { 
            apiKeyError = true;
            if (detail && detail.includes("paid")) {
                subscriptionError = true;
            }
            break; 
        }

        for (const item of torrents) {
            // Handle both torrent and usenet results
            const isUsenet = item._sourceType === "usenet" || item.nzb_id;
            const uniqueId = item.hash || item.nzb_id || item.id;
            
            if (uniqueId && seenIds.has(uniqueId)) continue;
            if (uniqueId) seenIds.add(uniqueId);

            const name = item.raw_title || item.name || item.title || "Unknown";
            const size = item.size ? (item.size / 1024 / 1024 / 1024).toFixed(2) + " GB" : "";
            const seeds = item.seeders || item.seed || 0;
            
            // Build stream info based on type
            const sourceLabel = isUsenet ? "Torbox NZB" : "Torbox";
            const infoLine = [
                size,
                isUsenet ? "Usenet" : (seeds ? "Seeds: " + seeds : "")
            ].filter(Boolean).join(" | ");

            if (isUsenet) {
                // Usenet results - use the nzb link or ID
                streams.push({
                    name: sourceLabel,
                    title: name + "\n" + infoLine,
                    // For usenet, we'd need to trigger a Torbox download
                    // Using externalUrl to let Torbox handle the NZB
                    externalUrl: item.nzb || item.link || "https://torbox.app",
                    behaviorHints: { bingeGroup: "f1-" + year + "-" + round },
                    _seeders: 0, // Usenet doesn't have seeders, sort last
                    _isUsenet: true
                });
            } else if (item.magnet || item.hash) {
                // Torrent results
                streams.push({
                    name: sourceLabel,
                    title: name + "\n" + infoLine,
                    infoHash: item.hash,
                    sources: item.hash ? ["dht:" + item.hash] : undefined,
                    behaviorHints: { bingeGroup: "f1-" + year + "-" + round },
                    _seeders: seeds,
                    _isUsenet: false
                });
            }
            
            if (streams.length >= 20) break;
        }
        if (streams.length >= 20) break;
    }

    if (subscriptionError) {
        return { streams: [{ 
            name: "F1 Catchup", 
            title: "Torbox search requires a paid subscription.\nVisit torbox.app to upgrade.", 
            externalUrl: "https://torbox.app/pricing" 
        }] };
    }
    if (apiKeyError) {
        return { streams: [{ name: "F1 Catchup", title: "Invalid Torbox API key.", externalUrl: "https://torbox.app/settings" }] };
    }
    if (streams.length === 0) {
        return { streams: [{ name: "F1 Catchup", title: "No streams found for:\n" + race.name + " - " + sessionDisplayName, externalUrl: "https://torbox.app" }] };
    }

    // Sort: torrents with most seeders first, then usenet
    streams.sort((a, b) => {
        // Torrents before usenet
        if (a._isUsenet !== b._isUsenet) return a._isUsenet ? 1 : -1;
        // Then by seeders
        return (b._seeders || 0) - (a._seeders || 0);
    });
    
    // Clean up internal properties before returning
    return { streams: streams.map(s => { 
        const copy = Object.assign({}, s); 
        delete copy._seeders; 
        delete copy._isUsenet;
        return copy; 
    }) };
}

// JSON response helper
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

// Main request handler
export async function onRequest(ctx) {
    const request = ctx.request;
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    const pathParts = path.split("/").filter(Boolean);
    if (pathParts.length < 2) return jsonResponse({ error: "Invalid path" }, 400);

    const apiKey = decodeURIComponent(pathParts[0]);
    const resource = pathParts[1];
    const origin = url.origin;
    const images = { poster: origin + IMAGE_POSTER_PATH, logo: origin + IMAGE_LOGO_PATH, background: origin + IMAGE_BG_PATH };

    try {
        if (resource === "manifest.json") return jsonResponse(getManifest(images));
        if (resource === "catalog" && pathParts.length >= 4) {
            if (pathParts[3].replace(".json", "") === "f1-catchup-catalog") return jsonResponse(await handleCatalog(ctx, images));
        }
        if (resource === "meta" && pathParts.length >= 4) return jsonResponse(await handleMeta(decodeURIComponent(pathParts[3].replace(".json", "")), ctx, images));
        if (resource === "stream" && pathParts.length >= 4) return jsonResponse(await handleStream(decodeURIComponent(pathParts[3].replace(".json", "")), apiKey, ctx));
        
        // Debug endpoint to test search
        if (resource === "debug") {
            const query = decodeURIComponent(pathParts[2] || "Formula 1 2024");
            const result = await searchTorbox(query, apiKey);
            return jsonResponse({
                query: query,
                torrentCount: result.torrents.length,
                error: result.error,
                endpoint: result.endpoint || "none",
                firstFew: result.torrents.slice(0, 5).map(t => ({ 
                    name: t.raw_title || t.name || t.title, 
                    seeders: t.seeders || t.seed, 
                    hash: t.hash 
                }))
            });
        }

        // Validate API key endpoint
        if (resource === "validate" && apiKey) {
            const response = await fetch(TORBOX_API + "/user/me", { 
                headers: { 
                    "Authorization": "Bearer " + apiKey, 
                    "User-Agent": "F1CatchupAddon/0.2.0" 
                } 
            });
            if (response.status === 401 || response.status === 403) {
                return jsonResponse({ error: "Invalid API key" }, 401);
            }
            if (!response.ok) {
                return jsonResponse({ error: "Torbox API Error" }, response.status);
            }
            const userData = await response.json();
            // Check if user has paid subscription (plan > 0)
            const isPaid = userData.data && userData.data.plan > 0;
            return jsonResponse({ 
                success: true, 
                data: userData,
                isPaidUser: isPaid,
                note: isPaid ? "Full search access available" : "Search requires paid subscription"
            });
        }

        return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
        console.error("Request error:", error);
        return jsonResponse({ error: "Internal server error", message: error.message }, 500);
    }
}
