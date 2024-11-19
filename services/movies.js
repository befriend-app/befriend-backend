const cacheService = require('./cache');
const dbService = require('./db');
const { getObj } = require('./cache');
const { normalizeSearch } = require('./shared');
const sectionsData = require('./sections_data');

const MAX_PREFIX_LIMIT = 3;
const RESULTS_LIMIT = 50;
const TOP_GENRE_COUNT = 100;


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
            const movieTokens = JSON.parse(await getObj(
                cacheService.keys.movie_genre_top_movies(genre_token)
            ));

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

function movieAutoComplete(search_term, category, params = {}) {
    return new Promise(async (resolve, reject) => {
        const minLength = sectionsData.movies.autoComplete.minChars;
        search_term = normalizeSearch(search_term);

        if (search_term.length < minLength) {
            return resolve([]);
        }

        let prefix = search_term.substring(0, MAX_PREFIX_LIMIT);
        let movieResults = [];
        let genreMovies = [];
        let remainingMovies = [];

        try {
            // Get prefix-matching movies
            const prefix_key = cacheService.keys.movies_prefix(prefix);
            const movie_tokens = await cacheService.getSetMembers(prefix_key);

            if (movie_tokens?.length) {
                let pipeline = cacheService.startPipeline();

                for (let token of movie_tokens) {
                    pipeline.hGet(cacheService.keys.movies, token);
                }

                let movies = await pipeline.execAsPipeline();

                // Break search term into words
                const searchWords = search_term.toLowerCase().split(/\s+/);

                for (let movie of movies) {
                    if (movie) {
                        try {
                            movie = JSON.parse(movie);

                            if (movie?.name) {
                                const movieName = movie.name.toLowerCase();
                                const movieWords = movieName.split(/\s+/);

                                // Different matching categories
                                const exactMatch = movieName === search_term;
                                const containsFullPhrase = movieName.includes(search_term);
                                const matchesAllWords = searchWords.every(searchWord =>
                                    movieWords.some(movieWord => movieWord.includes(searchWord))
                                );

                                if (exactMatch || containsFullPhrase || matchesAllWords) {
                                    // Filter by decade if specified
                                    if (params.decade) {
                                        const year = new Date(movie.release_date).getFullYear();
                                        const movieDecade = Math.floor(year / 10) * 10;
                                        if (movieDecade !== parseInt(params.decade)) {
                                            continue;
                                        }
                                    }

                                    movieResults.push(movie);
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing movie data:', e);
                        }
                    }
                }

                // For genre categories, separate movies by genre
                if (category?.token) {
                    for (let movie of movieResults) {
                        if (movie.genres && category.token in movie.genres) {
                            genreMovies.push(movie);
                        } else {
                            remainingMovies.push(movie);
                        }
                    }

                    // Combine with genre movies first
                    movieResults = genreMovies.concat(remainingMovies);
                }

                // Sort by popularity within each group
                movieResults.sort((a, b) => b.popularity - a.popularity);
            }

            // Limit final results
            movieResults = movieResults.slice(0, RESULTS_LIMIT);

            resolve(movieResults);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getNewReleases(limit = 100) {
    return new Promise(async (resolve, reject) => {
        try {
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
    prefixLimit: MAX_PREFIX_LIMIT,
    topGenreCount: TOP_GENRE_COUNT,
    getTopMoviesForGenre,
    getTopMoviesForDecade,
    movieAutoComplete,
    getNewReleases,
    getMoviesByDecade,
};