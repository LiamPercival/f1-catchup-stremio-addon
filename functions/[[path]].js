// F1 Catchup - Cloudflare Pages Function
// Fixed version - corrected date format and video ordering

const F1_API = "https://api.jolpi.ca/ergast/f1";
const OPENF1_API = "https://api.openf1.org/v1";
const TORBOX_API = "https://api.torbox.app/v1/api";

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
        // Remove trailing Z if present
        var cleanTime = time.replace(/Z$/, "");
        
        // If time already has timezone offset, use as-is
        if (cleanTime.match(/[+-]\d{2}:\d{2}$/)) {
            return date + "T" + cleanTime;
        }
        
        // Otherwise add Z for UTC
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
            "User-Agent": "F1CatchupAddon/0.1.0"
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
        
        // Testing events as Round 0
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

        // Race weekends
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

// Search Torbox
async function searchTorbox(query, apiKey) {
    if (!apiKey) return { torrents: [], error: "No API key provided" };

    try {
        const response = await fetch(
            TORBOX_API + "/torrents/search?query=" + encodeURIComponent(query),
            { 
                headers: { 
                    "Authorization": "Bearer " + apiKey,
                    "User-Agent": "F1CatchupAddon/0.1.0"
                } 
            }
        );

        if (response.status === 401 || response.status === 403) {
            return { torrents: [], error: "invalid_api_key" };
        }

        if (!response.ok) {
            return { torrents: [], error: "Torbox API error: " + response.status };
        }

        const data = await response.json();
        return { torrents: (data && data.data && data.data.torrents) || [], error: null };
    } catch (error) {
        console.error("Torbox search error:", error);
        return { torrents: [], error: "Network error searching Torbox" };
    }
}

// Generate manifest
function getManifest(images) {
    return {
        id: "com.f1catchup.addon",
        version: "0.2.0",
        name: "F1 Catchup",
        description: "Formula 1 sessions with Torbox - Includes sprint weekends",
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
    if (!id.startsWith("f1catchup:season:")) {
        return { meta: null };
    }

    const year = parseInt(id.split(":")[2]);
    const races = await getCalendar(year, ctx);

    if (!races.length) {
        return { meta: null };
    }

    const videos = [];
    var episodeCounter = 1;

    // Sort races by round first
    races.sort((a, b) => a.round - b.round);

    races.forEach(race => {
        const countryName = race.country || race.location;
        
        // Handle pre-season testing (Round 0)
        if (race.isTesting && race.testingSessions) {
            race.testingSessions.forEach((session, sessionIndex) => {
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
        
        // Normal race weekend
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

    // Sort by episode number ascending (1, 2, 3...) - Stremio expects this order
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
    if (!id.startsWith("f1catchup:")) {
        return { streams: [] };
    }

    const parts = id.split(":");
    const year = parts[1];
    const round = parseInt(parts[2]);
    const session = parts[3];

    const races = await getCalendar(year, ctx);
    const race = races.find(r => r.round === round);

    if (!race) {
        return { streams: [] };
    }

    const sessionDef = ALL_SESSION_DEFS.find(d => d.id === session);
    const sessionName = sessionDef ? sessionDef.searchTerm : session;
    const sessionDisplayName = sessionDef ? sessionDef.name : session;

    const paddedRound = String(round).padStart(2, "0");
    const raceName = race.name.replace(" Grand Prix", "").replace(" Prix", "");

    const searchQueries = [
        "Formula 1 " + year + " Round " + paddedRound + " " + race.location + " " + sessionName,
        "Formula 1 " + year + "x" + paddedRound + " " + sessionName,
        "F1 " + year + " R" + paddedRound + " " + sessionName,
        "Formula 1 " + year + " Round " + paddedRound + " " + race.location,
        "Formula 1 " + year + " " + raceName + " " + sessionName,
    ];

    const searchPromises = searchQueries.map(query => searchTorbox(query, apiKey));
    const searchResults = await Promise.allSettled(searchPromises);

    const streams = [];
    const seenHashes = new Set();
    var apiKeyError = false;

    for (const result of searchResults) {
        if (result.status !== "fulfilled") continue;
        const { torrents, error } = result.value;

        if (error === "invalid_api_key") {
            apiKeyError = true;
            break;
        }

        for (const torrent of torrents) {
            const hash = torrent.hash || torrent.id;
            if (hash && seenHashes.has(hash)) continue;
            if (hash) seenHashes.add(hash);

            const name = torrent.raw_title || torrent.name || "Unknown";
            const size = torrent.size
                ? (torrent.size / 1024 / 1024 / 1024).toFixed(2) + " GB"
                : "";
            const seeds = torrent.seeders || 0;
            const seedsDisplay = seeds ? "Seeds: " + seeds : "";

            if (torrent.magnet || torrent.hash) {
                streams.push({
                    name: "Torbox",
                    title: name + "\n" + [size, seedsDisplay].filter(Boolean).join(" | "),
                    infoHash: torrent.hash,
                    sources: torrent.hash ? ["dht:" + torrent.hash] : undefined,
                    behaviorHints: { bingeGroup: "f1-" + year + "-" + round },
                    _seeders: seeds
                });
            }

            if (streams.length >= 15) break;
        }

        if (streams.length >= 15) break;
    }

    if (apiKeyError) {
        return {
            streams: [{
                name: "F1 Catchup",
                title: "Invalid Torbox API key.\nPlease reinstall the addon with a valid key.",
                externalUrl: "https://torbox.app/settings"
            }]
        };
    }

    if (streams.length === 0) {
        return {
            streams: [{
                name: "F1 Catchup",
                title: "No streams found for:\n" + race.name + " - " + sessionDisplayName + "\n\nTry searching on Torbox directly.",
                externalUrl: "https://torbox.app"
            }]
        };
    }

    streams.sort((a, b) => (b._seeders || 0) - (a._seeders || 0));

    return {
        streams: streams.map(function(s) {
            const copy = Object.assign({}, s);
            delete copy._seeders;
            return copy;
        })
    };
}

// JSON response helper
function jsonResponse(data, status) {
    if (status === undefined) status = 200;
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
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    const pathParts = path.split("/").filter(Boolean);

    if (pathParts.length < 2) {
        return jsonResponse({ error: "Invalid path" }, 400);
    }

    const apiKey = decodeURIComponent(pathParts[0]);
    const resource = pathParts[1];

    const origin = url.origin;
    const images = {
        poster: origin + IMAGE_POSTER_PATH,
        logo: origin + IMAGE_LOGO_PATH,
        background: origin + IMAGE_BG_PATH
    };

    try {
        if (resource === "manifest.json") {
            return jsonResponse(getManifest(images));
        }

        if (resource === "catalog" && pathParts.length >= 4) {
            const catalogId = pathParts[3].replace(".json", "");
            if (catalogId === "f1-catchup-catalog") {
                const result = await handleCatalog(ctx, images);
                return jsonResponse(result);
            }
        }

        if (resource === "meta" && pathParts.length >= 4) {
            const id = decodeURIComponent(pathParts[3].replace(".json", ""));
            const result = await handleMeta(id, ctx, images);
            return jsonResponse(result);
        }

        if (resource === "stream" && pathParts.length >= 4) {
            const id = decodeURIComponent(pathParts[3].replace(".json", ""));
            const result = await handleStream(id, apiKey, ctx);
            return jsonResponse(result);
        }

        // Debug endpoint to test Torbox search
        if (resource === "debug") {
            var query = pathParts[2] || "F1 2024";
            query = decodeURIComponent(query);
            var result = await searchTorbox(query, apiKey);
            return jsonResponse({
                query: query,
                torrentCount: result.torrents.length,
                error: result.error,
                firstFew: result.torrents.slice(0, 5).map(function(t) {
                    return { name: t.raw_title || t.name, seeders: t.seeders };
                })
            });
        }

        if (resource === "validate" && apiKey) {
            try {
                const response = await fetch("https://api.torbox.app/v1/api/user/me", {
                    headers: { 
                        "Authorization": "Bearer " + apiKey,
                        "User-Agent": "F1CatchupAddon/0.1.0"
                    }
                });
                
                if (response.status === 401 || response.status === 403) {
                    return jsonResponse({ error: "Invalid API key" }, 401);
                }
                
                if (!response.ok) {
                    return jsonResponse({ error: "Torbox API Error: " + response.status }, response.status);
                }

                const data = await response.json();
                return jsonResponse({ success: true, data: data });
            } catch (err) {
                return jsonResponse({ error: "Validation failed", details: err.message }, 500);
            }
        }

        return jsonResponse({ error: "Not found" }, 404);

    } catch (error) {
        console.error("Error:", error);
        return jsonResponse({ error: "Internal server error", message: error.message }, 500);
    }
}
