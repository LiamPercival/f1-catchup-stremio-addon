// F1 Catchup - Cloudflare Pages Function
// Simplified version with better error handling

const F1_API = 'https://api.jolpi.ca/ergast/f1';
const TORBOX_API = 'https://api.torbox.app/v1/api';

// Country codes for flags
const COUNTRY_FLAGS = {
    'australia': 'au', 'china': 'cn', 'japan': 'jp', 'bahrain': 'bh',
    'saudi arabia': 'sa', 'usa': 'us', 'united states': 'us', 'italy': 'it',
    'monaco': 'mc', 'spain': 'es', 'canada': 'ca', 'austria': 'at',
    'uk': 'gb', 'great britain': 'gb', 'belgium': 'be', 'hungary': 'hu',
    'netherlands': 'nl', 'azerbaijan': 'az', 'singapore': 'sg', 'mexico': 'mx',
    'brazil': 'br', 'qatar': 'qa', 'uae': 'ae', 'abu dhabi': 'ae',
    'portugal': 'pt', 'turkey': 'tr', 'russia': 'ru', 'germany': 'de',
    'france': 'fr', 'malaysia': 'my', 'korea': 'kr', 'india': 'in',
    'vietnam': 'vn', 'las vegas': 'us', 'miami': 'us', 'emilia romagna': 'it',
    'imola': 'it',
};

const getFlagUrl = (country) => {
    const normalized = country.toLowerCase().trim();
    const code = COUNTRY_FLAGS[normalized] || 'un';
    return `https://flagcdn.com/w320/${code}.png`;
};

const SESSIONS = ['FP1', 'FP2', 'FP3', 'Qualifying', 'Grand Prix'];

const SESSION_SEARCH_TERMS = {
    'fp1': 'Practice 1',
    'fp2': 'Practice 2',
    'fp3': 'Practice 3',
    'qualifying': 'Qualifying',
    'grandprix': 'Race'
};

const SEASON_POSTER = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/F1.svg/800px-F1.svg.png';
const F1_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/F1.svg/800px-F1.svg.png';
const F1_BACKGROUND = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/F1.svg/800px-F1.svg.png';

// Get seasons - simplified with fallback
async function getSeasons() {
    try {
        const response = await fetch(`${F1_API}/seasons.json?limit=100`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        
        const data = await response.json();
        const seasons = data.MRData.SeasonTable.Seasons
            .map(s => parseInt(s.season))
            .filter(s => s >= 2000)
            .sort((a, b) => b - a);
        
        return seasons;
    } catch (error) {
        console.error('Failed to fetch seasons:', error);
        // Fallback to hardcoded recent seasons
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 25 }, (_, i) => currentYear - i);
    }
}

// Get calendar for a season - simplified with fallback
async function getCalendar(year) {
    try {
        const response = await fetch(`${F1_API}/${year}.json`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        
        const data = await response.json();
        const races = data.MRData.RaceTable.Races.map(race => ({
            round: parseInt(race.round),
            name: race.raceName,
            circuit: race.Circuit.circuitName,
            location: race.Circuit.Location.country,
            date: race.date
        }));
        
        return races;
    } catch (error) {
        console.error(`Failed to fetch ${year} calendar:`, error);
        return [];
    }
}

// Search Torbox
async function searchTorbox(query, apiKey) {
    if (!apiKey) return [];

    try {
        const response = await fetch(`${TORBOX_API}/torrents/search?query=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) throw new Error(`Torbox returned ${response.status}`);
        
        const data = await response.json();
        return data?.data?.torrents || [];
    } catch (error) {
        console.error('Torbox search error:', error);
        return [];
    }
}

// Generate manifest
function getManifest() {
    return {
        id: 'com.f1catchup.addon',
        version: '3.0.0',
        name: 'F1 Catchup',
        description: 'Formula 1 sessions with Torbox - Auto-updating calendar',
        logo: F1_LOGO,
        background: F1_BACKGROUND,
        resources: ['catalog', 'meta', 'stream'],
        types: ['series'],
        catalogs: [{
            type: 'series',
            id: 'f1-catchup-catalog',
            name: 'F1 Catchup',
            extra: [{ name: 'skip', isRequired: false }]
        }],
        idPrefixes: ['f1catchup:']
    };
}

// Handle catalog request
async function handleCatalog() {
    const seasons = await getSeasons();
    
    const metas = seasons.map(year => ({
        id: `f1catchup:season:${year}`,
        type: 'series',
        name: `Season ${year}`,
        poster: SEASON_POSTER,
        background: F1_BACKGROUND,
        description: `Formula 1 ${year} World Championship - All practice sessions, qualifying, and races`,
        releaseInfo: `${year}`,
        genres: ['Motorsport', 'Racing', 'Formula 1']
    }));
    
    return { metas };
}

// Handle meta request
async function handleMeta(id) {
    console.log('handleMeta called with id:', id);
    
    if (!id.startsWith('f1catchup:season:')) {
        console.log('ID does not start with f1catchup:season:');
        return { meta: null };
    }
    
    const year = parseInt(id.split(':')[2]);
    console.log('Fetching calendar for year:', year);
    
    const races = await getCalendar(year);
    console.log('Got races:', races.length);
    
    if (!races.length) {
        console.log('No races found for year:', year);
        return { meta: null };
    }
    
    const videos = [];
    races.forEach(race => {
        SESSIONS.forEach((session, sessionIndex) => {
            const episodeNumber = (race.round - 1) * SESSIONS.length + sessionIndex + 1;
            videos.push({
                id: `f1catchup:${year}:${race.round}:${session.toLowerCase().replace(' ', '')}`,
                title: `${episodeNumber} - ${session}`,
                season: 1,
                episode: episodeNumber,
                released: race.date ? `${race.date}T00:00:00.000Z` : `${year}-01-01T00:00:00.000Z`,
                overview: `Round ${race.round} - ${race.name}`,
                thumbnail: getFlagUrl(race.location)
            });
        });
    });
    
    console.log('Generated videos:', videos.length);
    
    return {
        meta: {
            id,
            type: 'series',
            name: `Season ${year}`,
            poster: SEASON_POSTER,
            background: F1_BACKGROUND,
            description: `Formula 1 ${year} World Championship - All practice sessions, qualifying, and races`,
            releaseInfo: `${year}`,
            genres: ['Motorsport', 'Racing', 'Formula 1'],
            videos
        }
    };
}

// Handle stream request
async function handleStream(id, apiKey) {
    console.log('handleStream called with id:', id);
    
    if (!id.startsWith('f1catchup:')) {
        return { streams: [] };
    }
    
    const parts = id.split(':');
    const year = parts[1];
    const round = parseInt(parts[2]);
    const session = parts[3];
    
    const races = await getCalendar(year);
    const race = races.find(r => r.round === round);
    
    if (!race) {
        return { streams: [] };
    }
    
    const sessionName = SESSION_SEARCH_TERMS[session] || session;
    const circuitShort = race.circuit.split(' ').slice(0, 2).join(' ');
    
    const searchQueries = [
        `Formula 1 ${year} ${race.location} ${sessionName}`,
        `F1 ${year} Round ${round} ${sessionName}`,
        `Formula 1 ${year} R${String(round).padStart(2, '0')} ${sessionName}`,
        `F1 ${year} ${circuitShort} ${sessionName}`,
    ];
    
    const streams = [];
    const seenHashes = new Set();
    
    for (const query of searchQueries) {
        console.log('Searching:', query);
        const results = await searchTorbox(query, apiKey);
        
        for (const result of results) {
            const hash = result.hash || result.id;
            if (hash && seenHashes.has(hash)) continue;
            if (hash) seenHashes.add(hash);
            
            const name = result.raw_title || result.name || 'Unknown';
            const size = result.size ? `${(result.size / 1024 / 1024 / 1024).toFixed(2)} GB` : '';
            const seeds = result.seeders ? `👥 ${result.seeders}` : '';
            
            if (result.magnet || result.hash) {
                streams.push({
                    name: 'Torbox',
                    title: `${name}\n${[size, seeds].filter(Boolean).join(' | ')}`,
                    infoHash: result.hash,
                    sources: result.hash ? [`dht:${result.hash}`] : undefined,
                    behaviorHints: { bingeGroup: `f1-${year}-${round}` }
                });
            }
            
            if (streams.length >= 15) break;
        }
        
        if (streams.length >= 15) break;
    }
    
    if (streams.length === 0) {
        return {
            streams: [{
                name: 'F1 Catchup',
                title: `No streams found for:\n${race.name} - ${sessionName}`,
                externalUrl: 'https://torbox.app'
            }]
        };
    }
    
    return { streams };
}

// JSON response helper
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// Main request handler
export async function onRequest(ctx) {
    const { request } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    
    console.log('Request path:', path);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
    
    // Parse path: /:apiKey/resource/type/id.json
    const pathParts = path.split('/').filter(Boolean);
    console.log('Path parts:', pathParts);
    
    // Need at least apiKey and resource for API routes
    if (pathParts.length < 2) {
        return jsonResponse({ error: 'Invalid path' }, 400);
    }
    
    const apiKey = decodeURIComponent(pathParts[0]);
    const resource = pathParts[1];
    
    console.log('Resource:', resource);
    
    try {
        // Handle manifest
        if (resource === 'manifest.json') {
            return jsonResponse(getManifest());
        }
        
        // Handle catalog: /:apiKey/catalog/series/f1-catchup-catalog.json
        if (resource === 'catalog' && pathParts.length >= 4) {
            const catalogId = pathParts[3].replace('.json', '');
            console.log('Catalog ID:', catalogId);
            if (catalogId === 'f1-catchup-catalog') {
                const result = await handleCatalog();
                return jsonResponse(result);
            }
        }
        
        // Handle meta: /:apiKey/meta/series/f1catchup:season:2025.json
        if (resource === 'meta' && pathParts.length >= 4) {
            const id = decodeURIComponent(pathParts[3].replace('.json', ''));
            console.log('Meta ID:', id);
            const result = await handleMeta(id);
            return jsonResponse(result);
        }
        
        // Handle stream: /:apiKey/stream/series/f1catchup:2025:1:fp1.json
        if (resource === 'stream' && pathParts.length >= 4) {
            const id = decodeURIComponent(pathParts[3].replace('.json', ''));
            console.log('Stream ID:', id);
            const result = await handleStream(id, apiKey);
            return jsonResponse(result);
        }
        
        return jsonResponse({ error: 'Not found', path, pathParts }, 404);
        
    } catch (error) {
        console.error('Error:', error);
        return jsonResponse({ error: 'Internal server error', message: error.message }, 500);
    }
}
