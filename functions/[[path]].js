// F1 Catchup - Catalog & Meta Provider
// Mapped to TheTVDB Series ID 387219 for integration with other Stremio addons

const F1_API = "https://api.jolpi.ca/ergast/f1";
const OPENF1_API = "https://api.openf1.org/v1";

// TVDB Configuration
const TVDB_SERIES_ID = 387219;
// Number of testing episodes at the start of each season
const TESTING_EPISODES = {
    2023: 6,
    2024: 5,
    2025: 6
};
// Map F1 Catchup session IDs to their 1-based index in a race weekend
const SESSION_INDEX = {
    "fp1": 1,
    "fp2": 2,
    "fp3": 3,
    "sprintquali": 2, // Sprint Shootout / Sprint Qualifying
    "sprint": 3,      // Sprint Race
    "qualifying": 4,
    "grandprix": 5
};

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
            "User-Agent": "F1CatchupAddon/1.0.0"
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
    return openF1Years; // Only return years we have TVDB mappings for
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
    return []; // We only support years with TVDB mapping
}

// Calculate TVDB Episode number
function getTvdbEpisode(year, round, sessionId) {
    if (!TESTING_EPISODES[year]) return null;

    const testingCount = TESTING_EPISODES[year];
    const sessionIdx = SESSION_INDEX[sessionId];

    if (!sessionIdx) return null;

    // Formula: testing_episodes + (round_number - 1) * 5 + session_index
    return testingCount + (round - 1) * 5 + sessionIdx;
}

// Generate manifest
function getManifest(images) {
    return {
        id: "org.f1catchup.catalog",
        version: "1.0.0",
        name: "F1 Calendar & Catalog",
        description: "Formula 1 Calendar with TheTVDB metadata integration. Provides accurate session lists for other addons to use.",
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
        idPrefixes: ["tvdb:"]
    };
}

// Handle catalog request
async function handleCatalog(ctx, images) {
    return {
        metas: [{
            id: "tvdb:" + TVDB_SERIES_ID,
            type: "series",
            name: "Formula 1",
            poster: images.poster,
            background: images.background,
            description: "Formula 1 World Championship\nAll practice sessions, qualifying, and races.",
            releaseInfo: "1950-2025",
            genres: ["Motorsport", "Racing", "Formula 1"],
            logo: images.logo
        }]
    };
}

// Handle meta request
async function handleMeta(id, ctx, images) {
    if (id !== "tvdb:" + TVDB_SERIES_ID) return { meta: null };

    const years = Object.keys(TESTING_EPISODES).map(y => parseInt(y)).sort((a,b) => b-a);
    const videos = [];

    for (const year of years) {
        const races = await getCalendar(year, ctx);
        if (!races || !races.length) continue;

        races.sort((a, b) => a.round - b.round);
        
        let testingEpisodeCounter = 1;

        races.forEach(race => {
            const countryName = race.country || race.location;

            // Testing Sessions (Usually mapped to episodes 1-5/6)
            if (race.isTesting && race.testingSessions) {
                // TVDB mapping for testing sessions is implicit in the testingCount,
                // but usually testing sessions are just "Episode 1, 2, 3...".
                // Since our formula is based on "Testing Episodes Count", we can assume
                // testing sessions start at 1.
                race.testingSessions.forEach((session) => {
                    const episodeNum = testingEpisodeCounter++;
                    videos.push({
                        id: "tvdb:" + TVDB_SERIES_ID + ":" + year + ":" + episodeNum,
                        title: session.name + " (" + race.location + ")",
                        season: year,
                        episode: episodeNum,
                        released: formatReleaseDate(session.date, session.time, year),
                        overview: "Pre-Season Testing - " + session.name,
                        thumbnail: getFlagUrl(countryName)
                    });
                });
                return;
            }

            // Race Weekend Sessions
            const sessions = getSessionsForRace(race);
            sessions.forEach((session) => {
                const episodeNum = getTvdbEpisode(year, race.round, session.id);
                if (episodeNum) {
                    videos.push({
                        id: "tvdb:" + TVDB_SERIES_ID + ":" + year + ":" + episodeNum,
                        title: race.name + " - " + session.name,
                        season: year,
                        episode: episodeNum,
                        released: formatReleaseDate(session.date, session.time, year),
                        overview: "Round " + race.round + " - " + race.name + " (" + session.name + ")",
                        thumbnail: getFlagUrl(countryName)
                    });
                }
            });
        });
    }

    return {
        meta: {
            id: id,
            type: "series",
            name: "Formula 1",
            poster: images.poster,
            background: images.background,
            description: "Formula 1 World Championship. All practice sessions, qualifying, and races.",
            genres: ["Motorsport", "Racing", "Formula 1"],
            logo: images.logo,
            videos: videos
        }
    };
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
    const origin = url.origin;
    const images = { poster: origin + IMAGE_POSTER_PATH, logo: origin + IMAGE_LOGO_PATH, background: origin + IMAGE_BG_PATH };

    try {
        if (path === "/manifest.json" || pathParts[0] === "manifest.json") return jsonResponse(getManifest(images));
        
        // Handle catalog/meta requests
        // Paths might be /catalog/type/id.json or /meta/type/id.json
        // Or with the old structure /API_KEY/catalog... but we ignore API_KEY now

        // Normalize path to ignore potentially leftover API keys from old installs
        // We look for 'catalog' or 'meta' in the path
        const resourceIndex = pathParts.findIndex(p => p === "catalog" || p === "meta");

        if (resourceIndex !== -1) {
            const resource = pathParts[resourceIndex];
            // type is usually next
            const type = pathParts[resourceIndex + 1];
            // id is usually next
            const id = pathParts[resourceIndex + 2]?.replace(".json", "");

            if (resource === "catalog") {
                return jsonResponse(await handleCatalog(ctx, images));
            }
            if (resource === "meta" && id) {
                return jsonResponse(await handleMeta(decodeURIComponent(id), ctx, images));
            }
        }

        return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
        console.error("Request error:", error);
        return jsonResponse({ error: "Internal server error", message: error.message }, 500);
    }
}
