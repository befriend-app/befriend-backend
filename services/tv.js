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
    NAME_MATCH: 0.2,
};

const networkMappings = {
    netflix: ['netflix'],
    disney: ['disney+', 'disney plus'],
    hbo: ['hbo', 'hbo max'],
    amazon: ['amazon', 'prime video', 'amazon prime'],
    apple: ['apple', 'apple tv+'],
    paramount: ['paramount+', 'paramount plus'],
    peacock: ['peacock'],
    showtime: ['showtime'],
    starz: ['starz'],
    abc: ['abc'],
    nbc: ['nbc'],
    cbs: ['cbs'],
    fox: ['fox'],
    cw: ['the cw', 'cw'],
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
        return voteScore * 0.75 + ratingScore * 0.25;
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
    return (
        voteScore * WEIGHTS.VOTES + ratingScore * WEIGHTS.RATING + nameScore * WEIGHTS.NAME_MATCH
    );
}

function formatShowLabel(showData) {
    // Case 1: Single year
    if (showData.year_from === showData.year_to) {
        return showData.year_from.toString();
    }

    // Case 2: Ongoing show (not ended and spans multiple years)
    if (!showData.is_ended && showData.year_from) {
        return `${showData.year_from} -`;
    }

    // Case 3: Ended show with multiple years
    if (showData.is_ended && showData.year_from && showData.year_to) {
        return `${showData.year_from} - ${showData.year_to}`;
    }

    // Default case: just show start year if we have it
    return showData.year_from ? showData.year_from.toString() : '';
}

function getTopShowsByCategory(category_token, topOnly = true) {
    return new Promise(async (resolve, reject) => {
        try {
            let cacheKey;

            // Determine which cache key to use based on category type
            if (category_token === 'popular') {
                cacheKey = cacheService.keys.tv_popular;
            } else if (category_token.match(/^\d{4}s$/)) {
                cacheKey = topOnly
                    ? cacheService.keys.tv_decade_top_shows(category_token)
                    : cacheService.keys.tv_decade_shows(category_token);
            } else if (category_token.startsWith('genre_')) {
                const genreToken = category_token.replace('genre_', '');
                cacheKey = topOnly
                    ? cacheService.keys.tv_genre_top_shows(genreToken)
                    : cacheService.keys.tv_genre_shows(genreToken);
            } else {
                cacheKey = topOnly
                    ? cacheService.keys.tv_network_top_shows(category_token)
                    : cacheService.keys.tv_network_shows(category_token);
            }

            // Get show tokens from cache
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

            // Process and format show data
            const currentYear = new Date().getFullYear();
            const results = shows
                .map((show) => {
                    if (!show) return null;
                    const showData = JSON.parse(show);

                    // Calculate show score for sorting
                    const score = calculateShowScore({
                        vote_count: showData.vote_count,
                        vote_average: showData.vote_average,
                    });

                    // Calculate recency value (higher for newer shows)
                    const recencyYear = !showData.is_ended ? currentYear : showData.year_to || showData.year_from;
                    let recencyScore = (recencyYear - 2000) / (currentYear - 2000); // Normalize to 0-1
                    recencyScore = Math.max(recencyScore, 0);

                    const combinedScore = (score * 0.4) + (recencyScore * 0.6);

                    return {
                        token: showData.token,
                        name: showData.name,
                        poster: showData.poster,
                        first_air_date: showData.first_air_date,
                        year_from: showData.year_from,
                        year_to: showData.year_to,
                        is_ended: showData.is_ended,
                        label: formatShowLabel(showData),
                        // meta: formatShowLabel(showData),
                        table_key: 'shows',
                        popularity: showData.popularity,
                        vote_count: showData.vote_count,
                        vote_average: showData.vote_average,
                        score: combinedScore,
                    };
                })
                .filter((show) => show !== null)
                // Sort by score if not using pre-sorted top shows
                .sort((a, b) => (!topOnly ? b.score - a.score : 0));

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
            const showTokens = await cacheService.getSetMembers(
                cacheService.keys.tv_prefix(prefix)
            );
            if (!showTokens?.length) return resolve([]);

            // Get full show data
            const pipeline = cacheService.startPipeline();
            for (const token of showTokens) {
                pipeline.hGet(cacheService.keys.tv_shows, token);
            }

            const showsData = await pipeline.execAsPipeline();
            const processedShows = showsData
                .map(s => s ? JSON.parse(s) : null)
                .filter(s => s && s.name.toLowerCase().includes(searchTermLower))
                .map(show => {
                    // Calculate base score
                    const score = calculateShowScore({
                        vote_count: show.vote_count,
                        vote_average: show.vote_average,
                    });

                    let isContextMatch = false;
                    if (context?.token) {
                        if (context.token === 'popular') {
                            isContextMatch = true; // Will sort by score
                        } else if (context.token.match(/^\d{4}s$/)) {
                            const contextDecade = parseInt(context.token);
                            const decades = new Set();

                            // Add year_from decade
                            if (show.year_from) {
                                decades.add(Math.floor(parseInt(show.year_from) / 10) * 10);
                            }

                            // Add year_to decade if different
                            if (show.year_to) {
                                decades.add(Math.floor(parseInt(show.year_to) / 10) * 10);
                            }

                            isContextMatch = decades.has(contextDecade);
                        } else if (context.token.startsWith('genre_')) {
                            const genreToken = context.token.replace('genre_', '');
                            isContextMatch = show.genres?.[genreToken] !== undefined;
                        } else {
                            isContextMatch = show.networks?.includes(context.token);
                        }
                    }

                    // Add context boost of 4 to score if matching
                    const finalScore = score + (isContextMatch ? 4 : 0);

                    return {
                        token: show.token,
                        name: show.name,
                        poster: show.poster,
                        first_air_date: show.first_air_date,
                        year_from: show.year_from,
                        year_to: show.year_to,
                        is_ended: show.is_ended,
                        networks: show.networks,
                        vote_count: show.vote_count,
                        vote_average: show.vote_average,
                        table_key: 'shows',
                        label: show.networks?.slice(0, 3)?.join(', '),
                        meta: formatShowLabel(show),
                        score: finalScore,
                        isContextMatch
                    };
                });

            // For all contexts, sort by score (which now includes context boost)
            processedShows.sort((a, b) => b.score - a.score);

            resolve(processedShows.slice(0, RESULTS_LIMIT));
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
    tvShowsAutoComplete,
};
