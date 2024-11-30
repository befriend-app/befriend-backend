const { loadScriptEnv, timeNow } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { calculateMovieScore, prefixLimit, topGenreCount } = require('../../services/movies');
const { getKeysWithPrefix, deleteKeys } = require('../../services/cache');

loadScriptEnv();

async function deletePreviousCustomKeys() {
    try {
        let keys = await getKeysWithPrefix('movies:');
        keys.push(
            cacheService.keys.movies,
            cacheService.keys.movie_genres,
            cacheService.keys.movies_new,
            cacheService.keys.movies_popular
        );
        await deleteKeys(keys);
    } catch (e) {
        console.error(e);
    }
}

function indexMovies() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            console.log("Load movies");

            // Get all movies
            const movies = await conn('movies')
                .whereNull('deleted')
                .select(
                    'id',
                    'token',
                    'name',
                    'tmdb_poster_path',
                    'original_language',
                    'release_date',
                    'popularity',
                    'vote_count',
                    'vote_average'
                );

            // Create data structures
            const moviesAll = {};
            const prefixGroups = {};
            const decadeGroups = {};
            const popularMovies = [];
            let moviesDict = {};

            // Process each movie
            for (let i = 0; i < movies.length; i++) {
                let movie = movies[i];

                movie.score = calculateMovieScore({
                    vote_count: movie.vote_count,
                    vote_average: movie.vote_average
                });
            }

            // Sort by score
            console.log("Sort by score");
            movies.sort((a, b) => b.score - a.score);

            // Prepare data
            console.log("Prepare data");

            for(let j = 0; j < movies.length; j++) {
                let movie = movies[j];

                const movieData = {
                    id: movie.id,
                    token: movie.token,
                    name: movie.name,
                    poster: movie.tmdb_poster_path,
                    language: movie.original_language,
                    release_date: movie.release_date,
                    popularity: movie.popularity,
                    vote_count: movie.vote_count,
                    vote_average: movie.vote_average,
                    score: movie.score,
                    genres: {}
                };

                const movieJson = JSON.stringify(movieData);

                moviesDict[movie.id] = movieData;
                moviesAll[movie.token] = movieJson;
                popularMovies.push({ token: movie.token, score: movie.score });

                if (movie.release_date) {
                    const year = new Date(movie.release_date).getFullYear();
                    const decade = Math.floor(year / 10) * 10;
                    if (!decadeGroups[decade]) {
                        decadeGroups[decade] = [];
                    }
                    decadeGroups[decade].push({ token: movie.token, score: movie.score });
                }

                const nameLower = movie.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);
                    if (!prefixGroups[prefix]) {
                        prefixGroups[prefix] = [];
                    }
                    prefixGroups[prefix].push(movie.token);
                }

                for (const word of words) {
                    if (word.length < 2) continue;
                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = [];
                        }
                        prefixGroups[prefix].push(movie.token);
                    }
                }
            }

            // Add genres to movies
            console.log("Add genre(s) to movies");

            const movieGenres = await conn('movies_genres AS mg')
                .join('movie_genres AS g', 'g.id', 'mg.genre_id')
                .whereNull('mg.deleted')
                .select('mg.movie_id', 'g.token', 'g.name');

            for (const mg of movieGenres) {
                if (moviesDict[mg.movie_id]) {
                    moviesDict[mg.movie_id].genres[mg.token] = {
                        token: mg.token,
                        name: mg.name
                    };
                }
            }

            // Update all movie data with genres
            for (const [token, movieStr] of Object.entries(moviesAll)) {
                const movie = JSON.parse(movieStr);
                if (moviesDict[movie.id]) {
                    movie.genres = moviesDict[movie.id].genres;
                    moviesAll[token] = JSON.stringify(movie);
                }
            }

            try {
                // Create new pipeline for adding data
                console.log("Add data to redis");
                pipeline = cacheService.startPipeline();

                // Store movie data
                pipeline.hSet(cacheService.keys.movies, moviesAll);

                // Store prefix indexes
                for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                    if (tokens.length) {
                        //store prefix for all and top 1000
                        let key_all = cacheService.keys.movies_prefix(prefix);
                        pipeline.del(key_all);
                        pipeline.sAdd(key_all, tokens);

                        let top_1000 = Array.from(new Set(tokens)).slice(0, 1000);
                        let key_top_1000 = cacheService.keys.movies_prefix_top_1000(prefix);

                        pipeline.del(key_top_1000);
                        pipeline.sAdd(key_top_1000, top_1000);
                    }
                }

                // Store popular movies
                const topPopular = popularMovies
                    .slice(0, topGenreCount)
                    .map(m => m.token);

                if (topPopular.length) {
                    let key = cacheService.keys.movies_popular;

                    pipeline.del(key);
                    pipeline.sAdd(key, topPopular);
                }

                // Store new releases
                let currentDate = new Date();
                const newReleasesCutoff = new Date(currentDate.setMonth(currentDate.getMonth() - 3));
                const newReleases = popularMovies
                    .filter(m => {
                        const movie = JSON.parse(moviesAll[m.token]);
                        return new Date(movie.release_date) >= newReleasesCutoff;
                    })
                    .slice(0, topGenreCount)
                    .map(m => m.token);

                if (newReleases.length) {
                    let key = cacheService.keys.movies_new;

                    pipeline.del(key);
                    pipeline.sAdd(key, newReleases);
                }

                // Store decade groups
                for (const [decade, movies] of Object.entries(decadeGroups)) {
                    const moviesKey = cacheService.keys.movies_decade_all(decade + 's');
                    const topKey = cacheService.keys.movies_decade_top(decade + 's');

                    const allMovies = movies.map(m => m.token);
                    const topMovies = movies
                        .slice(0, topGenreCount)
                        .map(m => m.token);

                    if (allMovies.length) {
                        pipeline.del(moviesKey);
                        pipeline.sAdd(moviesKey, allMovies);
                    }

                    if (topMovies.length) {
                        pipeline.del(topKey);
                        pipeline.sAdd(topKey, topMovies);
                    }
                }

                // Execute pipeline
                console.log("Execute pipeline");
                const results = await pipeline.execAsPipeline();

                console.log({
                    total_movies: movies.length,
                    with_genres: movieGenres.length,
                    prefixes: Object.keys(prefixGroups).length,
                    decades: Object.keys(decadeGroups).length,
                    new_releases: newReleases.length,
                    pipeline_results: results.length
                });

            } catch (pipelineError) {
                console.error('Pipeline execution error:', pipelineError);
                throw pipelineError;
            }

        } catch (e) {
            console.error('Error in indexMovies:', e);
            return reject(e);
        }

        resolve();
    });
}

function indexMovieGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all genres
            let genres = await conn('movie_genres').whereNull('deleted');

            let genresDict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            // Store all genres data
            const genresAll = genres.reduce((acc, genre) => {
                acc[genre.token] = JSON.stringify({
                    id: genre.id,
                    token: genre.token,
                    name: genre.name,
                    tmdb_id: genre.tmdb_id
                });
                return acc;
            }, {});

            // Get all genre associations with movies
            let movies_genres = await conn('movies_genres AS mg')
                .join('movies AS m', 'm.id', '=', 'mg.movie_id')
                .whereNull('mg.deleted')
                .whereNull('m.deleted')
                .select(
                    'm.token AS movie_token',
                    'm.vote_count',
                    'm.vote_average',
                    'mg.genre_id'
                );

            // Organize by genre
            const genreMovies = {};
            const genreTopMovies = {};

            for (const genre of genres) {
                genreMovies[genre.token] = new Set();
                genreTopMovies[genre.token] = [];
            }

            // Process associations and calculate scores
            for (const mg of movies_genres) {
                const genre = genresDict[mg.genre_id];
                if (!genre) continue;

                const movieScore = calculateMovieScore({
                    vote_count: mg.vote_count,
                    vote_average: mg.vote_average
                });

                genreMovies[genre.token].add(mg.movie_token);
                genreTopMovies[genre.token].push({
                    movie_token: mg.movie_token,
                    score: movieScore
                });
            }

            // Store in Redis
            // 1. Store all genres
            pipeline.hSet(cacheService.keys.movie_genres, genresAll);

            // 2. Store genre associations and top movies
            for (const [genreToken, movieTokens] of Object.entries(genreMovies)) {
                // Store all movies for this genre
                const moviesKey = cacheService.keys.movies_genre_all(genreToken);
                pipeline.del(moviesKey);
                if (movieTokens.size > 0) {
                    pipeline.sAdd(moviesKey, Array.from(movieTokens));
                }

                // Store top movies for this genre
                const topKey = cacheService.keys.movies_genre_top(genreToken);
                const topMovies = genreTopMovies[genreToken]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topGenreCount)
                    .map(m => m.movie_token);

                pipeline.del(topKey);
                if (topMovies.length > 0) {
                    pipeline.set(topKey, JSON.stringify(topMovies));
                }
            }

            await pipeline.execAsPipeline();

            console.log({
                genres_processed: genres.length,
                movies_genres_processed: movies_genres.length,
                genres_with_movies: Object.keys(genreMovies).filter(k => genreMovies[k].size > 0).length
            });
        } catch (e) {
            console.error('Error in indexMovieGenres:', e);
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

                await deletePreviousCustomKeys();

                console.log('Indexing movies...');
                await indexMovies();

                console.log('Indexing movie genres...');
                await indexMovieGenres();

                console.log('Movie indexing completed');
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