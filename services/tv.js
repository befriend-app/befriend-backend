const cacheService = require('./cache');
const { normalizeSearch } = require('./shared');

const MAX_PREFIX_LIMIT = 4;
const RESULTS_LIMIT = 50;
const TOP_SHOWS_COUNT = 100;

// Scoring weights
const MAX_VOTES = 10000;

const WEIGHTS = {
    VOTES: 0.6,
    RATING: 0.2,
    NAME_MATCH: 0.2
};

const networkMappings = {
    'netflix': ['netflix'],
    'disney': ['disney+', 'disney plus'],
    'hbo': ['hbo', 'hbo max'],
    'amazon': ['amazon', 'prime video', 'amazon prime'],
    'apple': ['apple', 'apple tv+'],
    'paramount': ['paramount+', 'paramount plus'],
    'peacock': ['peacock'],
    'showtime': ['showtime'],
    'starz': ['starz'],
    'abc': ['abc'],
    'nbc': ['nbc'],
    'cbs': ['cbs'],
    'fox': ['fox'],
    'cw': ['the cw', 'cw']
};

function normalizeVotes(voteCount) {
    return Math.min(voteCount / MAX_VOTES, 1);
}

// Calculate weighted score based on votes and rating
function calculateShowScore(show, searchTerm = null) {
    const voteScore = normalizeVotes(show.vote_count);
    const ratingScore = show.vote_average / 10;

    // If no search term, just use vote and rating weights
    if (!searchTerm) {
        return (voteScore * 0.75) + (ratingScore * 0.25);
    }

    // Calculate name match score for search
    let nameScore = 0;
    const name = show.name.toLowerCase();
    const search = searchTerm.toLowerCase();

    if (name === search) {
        nameScore = 1;
    } else if (name.startsWith(search)) {
        nameScore = 0.8;
    } else if (name.includes(search)) {
        nameScore = 0.6;
    }

    // Return weighted score including name match
    return (voteScore * WEIGHTS.VOTES) +
        (ratingScore * WEIGHTS.RATING) +
        (nameScore * WEIGHTS.NAME_MATCH);
}

function getTopShowsByCategory(category_token, topOnly = true) {
    return new Promise(async (resolve, reject) => {
        try {
            let cacheKey;

            if (category_token === 'popular') {
                cacheKey = cacheService.keys.tv_popular;
            } else if (category_token.match(/^\d{4}s$/)) {
                cacheKey = topOnly ?
                    cacheService.keys.tv_decade_top(category_token) :
                    cacheService.keys.tv_decade_shows(category_token);
            } else if (category_token.startsWith('genre_')) {
                const genreToken = category_token.replace('genre_', '');
                cacheKey = topOnly ?
                    cacheService.keys.tv_genre_top(genreToken) :
                    cacheService.keys.tv_genre_shows(genreToken);
            } else {
                cacheKey = topOnly ?
                    cacheService.keys.tv_network_top(category_token) :
                    cacheService.keys.tv_network_shows(category_token);
            }

            const showTokens = await cacheService.getSetMembers(cacheKey);
            if (!showTokens?.length) {
                return resolve([]);
            }

            // Get full show data for each token
            const pipeline = cacheService.startPipeline();
            for (const token of showTokens) {
                pipeline.hGet(cacheService.keys.tv_shows, token);
            }

            const shows = await pipeline.execAsPipeline();
            const results = shows
                .map(show => show ? JSON.parse(show) : null)
                .filter(show => show !== null)
                .map(show => ({
                    token: show.token,
                    name: show.name,
                    poster: show.tmdb_poster_path,
                    first_air_date: show.first_air_date,
                    year_from: show.year_from,
                    year_to: show.year_to,
                    label: show.year_from + (show.year_to && show.year_to !== show.year_from ? ` - ${show.year_to}` : ''),
                    meta: JSON.parse(show.networks || '[]').join(', ') || '',
                    popularity: show.popularity,
                    vote_count: show.vote_count,
                    vote_average: show.vote_average
                }));

            resolve(results);
        } catch (e) {
            console.error('Error in getTopShowsByCategory:', e);
            reject(e);
        }
    });
}

function tvShowsAutoComplete(search_term, context = null) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);
            if (search_term.length < 2) return resolve([]);

            const prefix = search_term.substring(0, MAX_PREFIX_LIMIT);
            const searchTermLower = search_term.toLowerCase();

            // Get show tokens matching prefix
            const showTokens = await cacheService.sMembers(cacheService.keys.tv_prefix(prefix));
            if (!showTokens?.length) return resolve([]);

            // Get full show data
            const pipeline = cacheService.startPipeline();
            for (const token of showTokens) {
                pipeline.hGet(cacheService.keys.tv_shows, token);
            }

            const showsData = await pipeline.execAsPipeline();
            const shows = showsData
                .map(s => s ? JSON.parse(s) : null)
                .filter(s => s && s.name.toLowerCase().includes(searchTermLower))
                .map(show => ({
                    token: show.token,
                    name: show.name,
                    poster: show.poster,
                    first_air_date: show.first_air_date,
                    networks: show.networks,
                    vote_count: show.vote_count,
                    vote_average: show.vote_average,
                    table_key: 'shows',
                    meta: show.networks || '',
                    label: show.first_air_date?.substring(0, 4) || '',
                    score: calculateShowScore(show, search_term)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, RESULTS_LIMIT);

            resolve(shows);
        } catch (e) {
            console.error('Error in tvShowsAutoComplete:', e);
            reject(e);
        }
    });
}

module.exports = {
    calculateShowScore,
    networks: networkMappings,
    prefixLimit: MAX_PREFIX_LIMIT,
    topShowsCount: TOP_SHOWS_COUNT,
    getTopShowsByCategory,
    tvShowsAutoComplete
};