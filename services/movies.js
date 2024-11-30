const cacheService = require('./cache');
const dbService = require('./db');
const { getObj, getSetMembers } = require('./cache');
const { normalizeSearch } = require('./shared');
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

function getTopMoviesForCategory(category_token) {
    return new Promise(async (resolve, reject) => {
        try {
            let cacheKey;

            // Determine which cache key to use based on category type
            if (category_token === 'new_releases') {
                cacheKey = cacheService.keys.movies_new;
            } else if (category_token === 'popular') {
                cacheKey = cacheService.keys.movies_popular;
            } else if (category_token.match(/^\d{4}s$/)) {
                cacheKey = cacheService.keys.movies_decade(category_token);
            } else {
                cacheKey = cacheService.keys.movie_genre_top_movies(category_token);
            }

            // Get movie tokens from cache
            const movieTokens = category_token.startsWith('genre_')
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

                    // Calculate movie score
                    const score = calculateMovieScore({
                        vote_count: movieData.vote_count,
                        vote_average: movieData.vote_average,
                    });

                    return {
                        token: movieData.token,
                        name: movieData.name,
                        poster: movieData.poster,
                        release_date: movieData.release_date,
                        popularity: movieData.popularity,
                        vote_count: movieData.vote_count,
                        vote_average: movieData.vote_average,
                        genres: movieData.genres,
                        score: score,
                        meta: movieData.release_date?.substring(0, 4)
                    };
                })
                .filter(movie => movie !== null)
                .sort((a, b) => b.score - a.score);

            resolve(results);
        } catch (e) {
            console.error('Error in getTopMoviesForCategory:', e);
            reject(e);
        }
    });
}

function searchMovies(search_term, category, limit = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const searchWords = search_term.toLowerCase().split(/\s+/);
            const prefix = search_term.substring(0, MAX_PREFIX_LENGTH);

            let prefix_key = cacheService.keys.movies_prefix(prefix);

            let movie_tokens = await getSetMembers(prefix_key);

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
                    const matchesAllWords = searchWords.every((searchWord) =>
                        movieWords.some((movieWord) => movieWord.includes(searchWord)),
                    );

                    if (!(exactMatch || containsPhrase || matchesAllWords)) {
                        continue;
                    }

                    let similarity = stringDistance(movieName, search_term);

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
                    else if (
                        searchWords.every((searchWord) =>
                            movieWords.some((movieWord) => movieWord.includes(searchWord)),
                        )
                    ) {
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

                    movie.score = matchScore * 0.4 + movie.popularity * 0.6;

                    // Check category context
                    let isInCategory = false;

                    if (category?.token) {
                        if (category.token === 'new_releases') {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const currentYear = new Date().getFullYear();
                            isInCategory = movieYear >= currentYear - 1;
                        } else if (DECADE_PATTERN.test(category.token)) {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const decadeStart = parseInt(category.token);
                            isInCategory = movieYear >= decadeStart && movieYear < decadeStart + 10;
                        } else if (movie.genres && category.token in movie.genres) {
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
            for (let movie of searchResults) {
                if (!movie.meta) {
                    movie.meta = movie.release_date?.substring(0, 4);
                }
            }

            resolve(searchResults);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function moviesAutoComplete(search_term, category = null) {
    return new Promise(async (resolve, reject) => {
        try {
            search_term = normalizeSearch(search_term);
            if (search_term.length < 2) return resolve([]);

            const prefix = search_term.substring(0, MAX_PREFIX_LENGTH);
            const searchTermLower = search_term.toLowerCase();

            // Get movie tokens matching prefix
            const movieTokens = await getSetMembers(
                cacheService.keys.movies_prefix(prefix)
            );
            if (!movieTokens?.length) return resolve([]);

            // Get full movie data
            const pipeline = cacheService.startPipeline();
            for (const token of movieTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const moviesData = await pipeline.execAsPipeline();
            const processedMovies = moviesData
                .map(m => m ? JSON.parse(m) : null)
                .filter(m => m && m.name.toLowerCase().includes(searchTermLower))
                .map(movie => {
                    // Calculate base score
                    const score = calculateMovieScore({
                        vote_count: movie.vote_count,
                        vote_average: movie.vote_average,
                    }, searchTermLower);

                    let isContextMatch = false;
                    if (category?.token) {
                        if (category.token === 'new_releases') {
                            const movieYear = new Date(movie.release_date).getFullYear();
                            const currentYear = new Date().getFullYear();
                            isContextMatch = movieYear >= currentYear - 1;
                        } else if (category.token === 'popular') {
                            isContextMatch = true; // Will sort by score
                        } else if (category.token.match(/^\d{4}s$/)) {
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

            resolve(processedMovies.slice(0, RESULTS_LIMIT));
        } catch (e) {
            console.error('Error in moviesAutoComplete:', e);
            reject(e);
        }
    });
}

function getNewReleases(limit = TOP_GENRE_COUNT) {
    return new Promise(async (resolve, reject) => {
        try {
            return getTopMoviesForCategory('new_releases');
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getMoviesByDecade(decade, page = 1, limit = 20) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!DECADE_PATTERN.test(decade)) {
                return reject('Invalid decade format');
            }

            const movieTokens = await getSetMembers(
                cacheService.keys.movies_decade_all(decade)
            );

            if (!movieTokens?.length) {
                return resolve([]);
            }

            // Calculate pagination
            const start = (page - 1) * limit;
            const end = start + limit;
            const paginatedTokens = movieTokens.slice(start, end);

            const pipeline = cacheService.startPipeline();
            for (const token of paginatedTokens) {
                pipeline.hGet(cacheService.keys.movies, token);
            }

            const movies = await pipeline.execAsPipeline();
            const results = movies
                .filter(Boolean)
                .map(m => JSON.parse(m))
                .sort((a, b) => calculateMovieScore(b) - calculateMovieScore(a));

            resolve(results);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}


module.exports = {
    prefixLimit: MAX_PREFIX_LENGTH,
    topGenreCount: TOP_GENRE_COUNT,
    calculateMovieScore,
    getTopMoviesForCategory,
    moviesAutoComplete,
    getNewReleases,
    getMoviesByDecade,
};


