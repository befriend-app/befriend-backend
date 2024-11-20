const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { prefixLimit, topGenreCount } = require('../../services/movies');

loadScriptEnv();

function indexGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            const genres = await conn('movie_genres')
                .whereNull('deleted')
                .orderBy('name');

            // Organize data structures for Redis
            const genresAll = {};
            const prefixGroups = {};
            const deletePrefixGroups = {};

            // Process all genres
            for (const genre of genres) {
                genresAll[genre.token] = JSON.stringify({
                    id: genre.id,
                    token: genre.token,
                    name: genre.name,
                    tmdb_id: genre.tmdb_id,
                    updated: genre.updated,
                    deleted: genre.deleted ? 1 : ''
                });

                // Index genre name prefixes
                const nameLower = genre.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);

                    if (genre.deleted) {
                        if (!deletePrefixGroups[prefix]) {
                            deletePrefixGroups[prefix] = new Set();
                        }
                        deletePrefixGroups[prefix].add(genre.token);
                    } else {
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(genre.token);
                    }
                }

                // Word prefixes
                for (const word of words) {
                    if (word.length < 2) continue;

                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);

                        if (genre.deleted) {
                            if (!deletePrefixGroups[prefix]) {
                                deletePrefixGroups[prefix] = new Set();
                            }
                            deletePrefixGroups[prefix].add(genre.token);
                        } else {
                            if (!prefixGroups[prefix]) {
                                prefixGroups[prefix] = new Set();
                            }
                            prefixGroups[prefix].add(genre.token);
                        }
                    }
                }
            }

            // Add to Redis
            // 1. Store all genres
            pipeline.hSet(cacheService.keys.movie_genres, genresAll);

            // 2. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(
                    cacheService.keys.movie_genres_prefix(prefix),
                    Array.from(tokens)
                );
            }

            // 3. Remove deleted items from prefix sets
            for (const [prefix, tokens] of Object.entries(deletePrefixGroups)) {
                if (tokens.size > 0) {
                    pipeline.sRem(
                        cacheService.keys.movie_genres_prefix(prefix),
                        Array.from(tokens)
                    );
                }
            }

            await pipeline.execAsPipeline();
        } catch (e) {
            console.error('Error in indexGenres:', e);
            return reject(e);
        }

        resolve();
    });
}

function indexMovies() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all movies with popularity
            const movies = await conn('movies')
                .whereNull('deleted')
                .orderBy('popularity', 'desc')
                .select(
                    'id',
                    'token',
                    'name',
                    'tmdb_poster_path',
                    'original_language',
                    'release_date',
                    'popularity'
                );

            // Create movies dictionary
            let moviesDict = {};
            for (const movie of movies) {
                moviesDict[movie.id] = {
                    id: movie.id,
                    token: movie.token,
                    name: movie.name,
                    poster: movie.tmdb_poster_path,
                    language: movie.original_language,
                    release_date: movie.release_date,
                    popularity: movie.popularity,
                    genres: {}
                };
            }

            // Get genre associations
            const movieGenres = await conn('movies_genres AS mg')
                .join('movie_genres AS g', 'g.id', 'mg.genre_id')
                .whereNull('mg.deleted')
                .select(
                    'mg.movie_id',
                    'g.token as genre_token',
                    'g.name as genre_name'
                );

            // Add genres to movies
            for (const mg of movieGenres) {
                if (moviesDict[mg.movie_id]) {
                    moviesDict[mg.movie_id].genres[mg.genre_token] = {
                        token: mg.genre_token,
                        name: mg.genre_name
                    };
                }
            }

            // Organize data structures for Redis
            const moviesAll = {};
            const prefixGroups = {};
            const decadeGroups = {};

            // Process all movies
            for (const movie of Object.values(moviesDict)) {
                // Store complete movie data
                moviesAll[movie.token] = JSON.stringify({
                    id: movie.id,
                    token: movie.token,
                    name: movie.name,
                    poster: movie.poster,
                    language: movie.language,
                    release_date: movie.release_date,
                    popularity: movie.popularity,
                    genres: movie.genres
                });

                // Calculate decade
                const year = new Date(movie.release_date).getFullYear();
                const decade = Math.floor(year / 10) * 10;

                if (!decadeGroups[decade]) {
                    decadeGroups[decade] = [];
                }
                decadeGroups[decade].push({
                    token: movie.token,
                    popularity: movie.popularity
                });

                // Index movie name prefixes
                const nameLower = movie.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);

                    if (!prefixGroups[prefix]) {
                        prefixGroups[prefix] = new Set();
                    }
                    prefixGroups[prefix].add(movie.token);
                }

                // Word prefixes
                for (const word of words) {
                    if (word.length < 2) continue;
                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);

                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(movie.token);
                    }
                }
            }

            // Add to Redis
            // 1. Store all movies
            pipeline.hSet(cacheService.keys.movies, moviesAll);

            // 2. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(
                    cacheService.keys.movies_prefix(prefix),
                    Array.from(tokens)
                );
            }

            // 3. Store decade groups (sorted by popularity)
            for (const [decade, movies] of Object.entries(decadeGroups)) {
                // Sort by popularity and take top 100
                const topMovies = movies
                    .sort((a, b) => b.popularity - a.popularity)
                    .slice(0, 100)
                    .map(m => m.token);

                pipeline.sAdd(
                    cacheService.keys.movies_decade(decade + 's'),
                    topMovies
                );
            }

            await pipeline.execAsPipeline();

            console.log({
                total_movies: Object.keys(moviesDict).length,
                with_genres: movieGenres.length,
                prefixes: Object.keys(prefixGroups).length,
                decades: Object.keys(decadeGroups).length
            });
        } catch (e) {
            console.error('Error in indexMovies:', e);
            return reject(e);
        }

        resolve();
    });
}

function indexMoviesGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all genres and create lookup dictionary
            let genres = await conn('movie_genres')
                .whereNull('deleted');

            let genresDict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            // Get all genre associations
            let movies_genres = await conn('movies_genres AS mg')
                .join('movies AS m', 'm.id', '=', 'mg.movie_id')
                .whereNull('mg.deleted')
                .whereNull('m.deleted')
                .orderBy('m.popularity', 'desc')
                .select(
                    'm.token AS movie_token',
                    'm.popularity',
                    'mg.genre_id'
                );

            // Organize by genre
            const genreMovies = {};
            const genreTopMovies = {};

            // Initialize data structures for each genre
            for (const genre of genres) {
                genreMovies[genre.token] = new Set();
                genreTopMovies[genre.token] = [];
            }

            // Process associations using dictionary lookup
            for (const mg of movies_genres) {
                const genre = genresDict[mg.genre_id];
                if (!genre) continue;

                genreMovies[genre.token].add(mg.movie_token);

                // Track top 100 movies per genre
                if (genreTopMovies[genre.token].length < topGenreCount) {
                    genreTopMovies[genre.token].push({
                        movie_token: mg.movie_token,
                        popularity: mg.popularity
                    });
                }
            }

            // Store in Redis
            for (const [genreToken, movieTokens] of Object.entries(genreMovies)) {
                // Store all movies for this genre
                if (movieTokens.size > 0) {
                    pipeline.sAdd(
                        cacheService.keys.movie_genre_movies(genreToken),
                        Array.from(movieTokens)
                    );
                }

                // Store top movies for this genre
                const topMovies = genreTopMovies[genreToken]
                    .sort((a, b) => b.popularity - a.popularity)
                    .map(m => m.movie_token);

                if (topMovies.length > 0) {
                    pipeline.set(
                        cacheService.keys.movie_genre_top_movies(genreToken),
                        JSON.stringify(topMovies)
                    );
                }
            }

            await pipeline.execAsPipeline();

            console.log({
                genres_processed: Object.keys(genresDict).length,
                movies_genres_processed: movies_genres.length,
                genres_with_movies: Object.keys(genreMovies).filter(k => genreMovies[k].size > 0).length
            });
        } catch (e) {
            console.error('Error in indexMoviesGenres:', e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main: async function() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Indexing movie data');
                await cacheService.init();

                console.log('Indexing genres...');
                await indexGenres();

                console.log('Indexing movies...');
                await indexMovies();

                console.log('Indexing movies-genres...');
                await indexMoviesGenres();

                console.log("Movie indexing completed");
                resolve();
            } catch (e) {
                console.error('Error in main indexing execution:', e);
                reject(e);
            }
        });
    }
};

if (require.main === module) {
    (async function() {
        try {
            await module.exports.main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}