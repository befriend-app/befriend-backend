const cacheService = require('./cache');
const dbService = require('./db');
const { getObj, getSetMembers } = require('./cache');
const { normalizeSearch, stringDistance, timeNow, mdp, mdpe } = require('./shared');
const sectionsData = require('./sections_data');

const MAX_PREFIX_LENGTH = 5;
const RESULTS_LIMIT = 50;
const TOP_GENRE_COUNT = 100;
const INITIAL_LIMIT = 1000;
const DECADE_PATTERN = /^\d{4}s$/;

const COMMON_WORDS = [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by'
];


function getTopMoviesForDecade(decade) {
    return new Promise(async (resolve, reject) => {
        try {
            const movieTokens = await cacheService.getSetMembers(
                cacheService.keys.movies_decade(decade)
            );

            if (!movieTokens?.length) {
                return reject("No movies found for decade");
            }

            let pipeline = cacheService.startPipeline();

            for (const token of movieTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const movies = await pipeline.execAsPipeline();
            const parsed = movies
                .filter(Boolean)
                .map(m => JSON.parse(m))
                .sort((a, b) => b.popularity - a.popularity);

            resolve(parsed);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getTopMoviesForGenre(genre_token) {
    return new Promise(async (resolve, reject) => {
        try {
            const movieTokens = await getObj(
                cacheService.keys.movie_genre_top_movies(genre_token)
            );

            if (!movieTokens?.length) {
                return reject("No movies found for genre");
            }

            let pipeline = cacheService.startPipeline();

            for (const token of movieTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const movies = await pipeline.execAsPipeline();
            const parsed = movies
                .filter(Boolean)
                .map(m => JSON.parse(m));

            resolve(parsed);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function moviesAutoComplete(search_term, category) {
    return new Promise(async (resolve, reject) => {
        const minLength = sectionsData.movies.autoComplete.minChars;
        search_term = normalizeSearch(search_term);

        if (search_term.length < minLength) {
            return resolve([]);
        }

        try {
            // If we have a category, we should always do a full search
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

            const fullResults = await searchMovies(search_term, category);
            return resolve(fullResults.slice(0, RESULTS_LIMIT));
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function searchMovies(search_term, category, limit = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const searchWords = search_term.toLowerCase().split(/\s+/);
            const prefix = search_term.substring(0, MAX_PREFIX_LENGTH);

            let prefix_key = cacheService.keys.movies_prefix(prefix);

            let movie_tokens = await getSetMembers(prefix_key)

            if (!movie_tokens.length) {
                return resolve([]);
            }

            // Get movie data in batches if needed
            const batches = [];
            const batchSize = 1000;

            // Apply initial limit if specified
            const effectiveTokens = limit ? movie_tokens.slice(0, limit) : movie_tokens;

            for (let i = 0; i < effectiveTokens.length; i += batchSize) {
                const batch = effectiveTokens.slice(i, i + batchSize);
                let pipeline = cacheService.startPipeline();

                for (let token of batch) {
                    pipeline.hGet(cacheService.keys.movies, token);
                }

                batches.push(pipeline.execAsPipeline());
            }

            const batchResults = await Promise.all(batches);

            const categoryMovies = [];
            const otherMovies = [];

            // Process movies from all batches
            for (let batch of batchResults) {
                for (let movieData of batch) {
                    if (!movieData) continue;

                    let movie;
                    try {
                        movie = JSON.parse(movieData);
                    } catch (e) {
                        continue;
                    }

                    const movieName = movie.name.toLowerCase();
                    const movieWords = movieName.split(/\s+/);

                    // Match criteria
                    const exactMatch = movieName === search_term;
                    const containsPhrase = movieName.includes(search_term);
                    const matchesAllWords = searchWords.every(searchWord =>
                        movieWords.some(movieWord => movieWord.includes(searchWord))
                    );

                    if (!(exactMatch || containsPhrase || matchesAllWords)) {
                        continue;
                    }

                    let similarity = stringDistance(movieName, search_term)

                    // Calculate match score
                    let matchScore = 0;

                    // Exact match gets highest score
                    if (movieName === search_term) {
                        matchScore = 1;
                    }
                    // Full phrase match gets high score
                    else if (movieName.includes(search_term)) {
                        matchScore = 0.8;
                    }
                    // All words match in any order gets medium score
                    else if (searchWords.every(searchWord =>
                        movieWords.some(movieWord => movieWord.includes(searchWord))
                    )) {
                        matchScore = 0.6;
                    }
                    // Some words match gets lower score
                    else {
                        let matchCount = 0;
                        for (let searchWord of searchWords) {
                            for (let movieWord of movieWords) {
                                if (movieWord.includes(searchWord)) {
                                    matchCount++;
                                    break;
                                }
                            }
                        }
                        if (matchCount > 0) {
                            matchScore = 0.2 + (matchCount / searchWords.length) * 0.2;
                        }
                    }

                    // Skip if no match
                    if (matchScore === 0) continue;

                    movie.score = (matchScore * 0.4 + movie.popularity * 0.6);

                    // Check category context
                    let isInCategory = false;

                    if (category?.token) {
                        if (category.token === 'new_releases') {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const currentYear = new Date().getFullYear();
                            isInCategory = movieYear >= currentYear - 1;
                        }
                        else if (DECADE_PATTERN.test(category.token)) {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const decadeStart = parseInt(category.token);
                            isInCategory = movieYear >= decadeStart && movieYear < decadeStart + 10;
                        }
                        else if (movie.genres && category.token in movie.genres) {
                            isInCategory = true;
                        }
                    }

                    // Add to appropriate result array
                    if (isInCategory) {
                        categoryMovies.push(movie);
                    } else {
                        otherMovies.push(movie);
                    }
                }
            }

            // Sort both arrays by score
            categoryMovies.sort((a, b) => b.score - a.score);
            otherMovies.sort((a, b) => b.score - a.score);

            // Combine results, category matches first
            const searchResults = categoryMovies.concat(otherMovies);

            // Add year metadata
            for(let movie of searchResults) {
                if (!movie.meta) {
                    movie.meta = movie.release_date?.substring(0, 4);
                }
            }

            resolve(searchResults);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getNewReleases(limit = 100) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.movies_new;

            // Try to get from cache first
            let cached_data = await cacheService.getObj(cache_key);

            //todo remove
            if (false && cached_data?.length) {
                return resolve(cached_data);
            }

            // If not in cache, get from DB
            const conn = await dbService.conn();

            // Get movies released in the last 90 days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);

            const movies = await conn('movies')
                .whereNull('deleted')
                .where('release_date', '>=', cutoffDate.toISOString().split('T')[0])
                .orderBy('popularity', 'desc')
                .limit(limit)
                .select('token');

            if (!movies.length) {
                return resolve([]);
            }

            // Get full movie data from Redis
            let pipeline = cacheService.startPipeline();

            for (const movie of movies) {
                pipeline.hGet(cacheService.keys.movies, movie.token);
            }

            const results = await pipeline.execAsPipeline();
            const parsed = results
                .filter(Boolean)
                .map(m => JSON.parse(m));

            // Save to cache with 30-day expiry
            const CACHE_DAYS = 30;
            const SECONDS_PER_DAY = 86400;
            await cacheService.setCache(
                cache_key, parsed,
                CACHE_DAYS * SECONDS_PER_DAY
            );

            resolve(parsed);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getMoviesByDecade(decade, page = 1, limit = 20) {
    return new Promise(async (resolve, reject) => {
        try {
            const conn = await dbService.conn();

            // Calculate decade range
            const startYear = parseInt(decade);
            const endYear = startYear + 9;

            const offset = (page - 1) * limit;

            const movies = await conn('movies')
                .whereNull('deleted')
                .whereRaw('YEAR(release_date) BETWEEN ? AND ?', [startYear, endYear])
                .orderBy('popularity', 'desc')
                .offset(offset)
                .limit(limit)
                .select('token');

            if (!movies.length) {
                return resolve([]);
            }

            let pipeline = cacheService.startPipeline();

            for (const movie of movies) {
                pipeline.hGet(cacheService.keys.movies, movie.token);
            }

            const results = await pipeline.execAsPipeline();
            const parsed = results
                .filter(Boolean)
                .map(m => JSON.parse(m));

            resolve(parsed);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LENGTH,
    topGenreCount: TOP_GENRE_COUNT,
    getTopMoviesForGenre,
    getTopMoviesForDecade,
    moviesAutoComplete,
    getNewReleases,
    getMoviesByDecade,
};