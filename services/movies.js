const cacheService = require('./cache');
const dbService = require('./db');
const { getObj, getSetMembers, getSortedSetByScore, getSortedSet } = require('./cache');
const { normalizeSearch, timeNow } = require('./shared');
const sectionsData = require('./sections_data');

const MAX_PREFIX_LENGTH = 5;
const RESULTS_LIMIT = 50;
const TOP_GENRE_COUNT = 100;
const INITIAL_LIMIT = 1000;
const DECADE_PATTERN = /^\d{4}s$/;

// Scoring weights
const MAX_VOTES = 10000;
const WEIGHTS = {
    VOTES: 0.6,
    RATING: 0.2,
    NAME_MATCH: 0.2,
};

function normalizeVotes(voteCount) {
    return Math.min(voteCount / MAX_VOTES, 1);
}

function calculateMovieScore(movie, searchTerm = null) {
    const voteScore = normalizeVotes(movie.vote_count);
    const ratingScore = movie.vote_average / 10;

    // If no search term, just use vote and rating weights
    if (!searchTerm) {
        return voteScore * 0.75 + ratingScore * 0.25;
    }

    // Calculate name match score for search
    let nameScore = 0;
    const name = movie.name.toLowerCase();
    const search = searchTerm.toLowerCase();

    if (name === search) {
        nameScore = 1;
    } else if (name.startsWith(search)) {
        nameScore = 0.8;
    } else if (name.includes(search)) {
        nameScore = 0.6;
    }

    return (
        voteScore * WEIGHTS.VOTES +
        ratingScore * WEIGHTS.RATING +
        nameScore * WEIGHTS.NAME_MATCH
    );
}

function getTopMoviesByCategory(category_token, topOnly = true) {
    return new Promise(async (resolve, reject) => {
        try {
            let cacheKey;

            // Determine which cache key to use based on category type
            if (category_token === 'popular') {
                cacheKey = cacheService.keys.movies_popular;
            } else if (category_token === 'new_releases') {
                cacheKey = cacheService.keys.movies_new;
            } else if (category_token.match(DECADE_PATTERN)) {
                cacheKey = topOnly
                    ? cacheService.keys.movies_decade_top(category_token)
                    : cacheService.keys.movies_decade_all(category_token);
            } else if (category_token.startsWith('genre_')) {
                const genreToken = category_token.replace('genre_', '');
                cacheKey = topOnly
                    ? cacheService.keys.movies_genre_top(genreToken)
                    : cacheService.keys.movies_genre_all(genreToken);
            } else {
                return resolve([]);
            }

            // Get movie tokens from cache
            const movieTokens = category_token.startsWith('genre_') && topOnly
                ? await getObj(cacheKey)
                : await getSetMembers(cacheKey);

            if (!movieTokens?.length) {
                return resolve([]);
            }

            // Get full movie data for each token
            const pipeline = cacheService.startPipeline();
            for (const token of movieTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const movies = await pipeline.execAsPipeline();

            // Process and format movie data
            const results = movies
                .map(movie => {
                    if (!movie) return null;
                    const movieData = JSON.parse(movie);

                    // Calculate movie score for sorting
                    const score = calculateMovieScore({
                        vote_count: movieData.vote_count,
                        vote_average: movieData.vote_average
                    });

                    return {
                        token: movieData.token,
                        name: movieData.name,
                        poster: movieData.poster,
                        release_date: movieData.release_date,
                        label: movieData.release_date?.substring(0, 4),
                        popularity: movieData.popularity,
                        vote_count: movieData.vote_count,
                        vote_average: movieData.vote_average,
                        score: score
                    };
                })
                .filter(movie => movie !== null)
                .sort((a, b) => b.score - a.score);

            resolve(results);
        } catch (e) {
            console.error('Error in getTopMoviesByCategory:', e);
            reject(e);
        }
    });
}

function moviesAutoComplete(search_term, category = null) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);
            if (search_term.length < 2) return resolve([]);

            // If we have a category, always do a full search
            // to ensure we don't miss category-relevant results
            if (category?.token) {
                const results = await searchMovies(search_term, category);
                return resolve(results.slice(0, RESULTS_LIMIT));
            }

            // Two-pass search
            const results = await searchMovies(search_term, category, INITIAL_LIMIT);

            // If we have enough results after filtering, return them
            if (results.length >= RESULTS_LIMIT) {
                return resolve(results.slice(0, RESULTS_LIMIT));
            }

            // Otherwise, do a full search
            const fullResults = await searchMovies(search_term, category);
            return resolve(fullResults.slice(0, RESULTS_LIMIT));
        } catch (e) {
            console.error('Error in moviesAutoComplete:', e);
            reject(e);
        }
    });
}

function searchMovies(search_term, category, limit = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const prefix = search_term.substring(0, MAX_PREFIX_LENGTH);
            const searchTermLower = search_term.toLowerCase();

            // Get movie tokens matching prefix
            let movieTokens;

            if(limit) {
                movieTokens = await getSetMembers(cacheService.keys.movies_prefix_top_1000(prefix));
            } else {
                movieTokens = await getSetMembers(cacheService.keys.movies_prefix(prefix));
            }

            if (!movieTokens?.length) return resolve([]);

            // Apply initial limit if specified
            const effectiveTokens = limit ? movieTokens.slice(0, limit) : movieTokens;

            // Get full movie data
            const pipeline = cacheService.startPipeline();
            for (const token of effectiveTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const moviesData = await pipeline.execAsPipeline();
            const processedMovies = moviesData
                .map(m => m ? JSON.parse(m) : null)
                .filter(m => m && m.name.toLowerCase().includes(searchTermLower))
                .map(movie => {
                    // Calculate base score
                    const score = calculateMovieScore(movie, searchTermLower);

                    let isContextMatch = false;
                    if (category?.token) {
                        if (category.token === 'new_releases') {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const currentYear = new Date().getFullYear();
                            isContextMatch = movieYear >= currentYear - 1;
                        } else if (category.token === 'popular') {
                            isContextMatch = true; // Will sort by score
                        } else if (category.token.match(DECADE_PATTERN)) {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const decadeStart = parseInt(category.token);
                            isContextMatch = movieYear >= decadeStart && movieYear < decadeStart + 10;
                        } else if (category.token.startsWith('genre_')) {
                            const genreToken = category.token.replace('genre_', '');
                            isContextMatch = movie.genres?.[genreToken] !== undefined;
                        }
                    }

                    // Add category match boost to score
                    const finalScore = score + (isContextMatch ? 4 : 0);

                    return {
                        table_key: 'movies',
                        token: movie.token,
                        name: movie.name,
                        poster: movie.poster,
                        release_date: movie.release_date,
                        genres: movie.genres,
                        vote_count: movie.vote_count,
                        vote_average: movie.vote_average,
                        meta: movie.release_date?.substring(0, 4),
                        score: finalScore,
                        isContextMatch
                    };
                });

            // Sort by score (which includes context boost)
            processedMovies.sort((a, b) => b.score - a.score);

            resolve(processedMovies);
        } catch (e) {
            console.error('Error in searchMovies:', e);
            reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LENGTH,
    topGenreCount: TOP_GENRE_COUNT,
    calculateMovieScore,
    getTopMoviesByCategory,
    moviesAutoComplete,
};