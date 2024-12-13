const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { calculateShowScore, prefixLimit, networks, topShowsCount } = require('../../services/tv'); //
const { getKeysWithPrefix, deleteKeys } = require('../../services/cache');

loadScriptEnv();

async function deletePreviousCustomKeys() {
    try {
        let keys = await getKeysWithPrefix('tv:');
        keys.push(
            cacheService.keys.tv_shows,
            cacheService.keys.tv_genres,
            cacheService.keys.tv_popular,
        );
        await deleteKeys(keys);
    } catch (e) {
        console.error(e);
    }
}

function indexTvShows() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            const shows = await conn('tv_shows')
                .whereNull('deleted')
                .select(
                    'id',
                    'token',
                    'name',
                    'tmdb_poster_path',
                    'original_language',
                    'first_air_date',
                    'year_from',
                    'year_to',
                    'is_ended',
                    'popularity',
                    'vote_count',
                    'vote_average',
                    'networks',
                );

            // Create data structures
            const showsAll = {};
            const prefixGroups = {};
            const decadeGroups = {};
            const networkGroups = {};
            const popularShows = [];
            let showsDict = {};

            // Process each show
            for (const show of shows) {
                // Calculate show score
                const score = calculateShowScore(show);

                if (show.networks) {
                    try {
                        show.networks = JSON.parse(show.networks);
                    } catch (e) {}
                }

                // Store full show data
                const showData = {
                    id: show.id,
                    token: show.token,
                    name: show.name,
                    poster: show.tmdb_poster_path,
                    language: show.original_language,
                    first_air_date: show.first_air_date,
                    year_from: show.year_from,
                    year_to: show.year_to,
                    is_ended: show.is_ended ? true : '',
                    networks: show.networks,
                    popularity: show.popularity,
                    vote_count: show.vote_count,
                    vote_average: show.vote_average,
                    score: score,
                    genres: {},
                };

                showsDict[show.id] = showData;
                showsAll[show.token] = JSON.stringify(showData);
                popularShows.push({ token: show.token, score: score });

                // Handle decades
                if (show.year_from) {
                    const startDecade = Math.floor(show.year_from / 10) * 10;
                    if (!decadeGroups[startDecade]) {
                        decadeGroups[startDecade] = new Set();
                    }
                    decadeGroups[startDecade].add({ token: show.token, score: score });

                    // If show spans multiple decades, add to each decade
                    if (show.year_to) {
                        const endDecade = Math.floor(show.year_to / 10) * 10;
                        for (let decade = startDecade + 10; decade <= endDecade; decade += 10) {
                            if (!decadeGroups[decade]) {
                                decadeGroups[decade] = new Set();
                            }
                            decadeGroups[decade].add({ token: show.token, score: score });
                        }
                    }
                }

                // Add to networks cache if featured network
                if (show.networks) {
                    const networksList = show.networks;
                    const networksLower = networksList.join(' ').toLowerCase();

                    for (const [networkKey, networkVariants] of Object.entries(networks)) {
                        if (networkVariants.some((variant) => networksLower.includes(variant))) {
                            if (!networkGroups[networkKey]) {
                                networkGroups[networkKey] = new Set();
                            }
                            networkGroups[networkKey].add({ token: show.token, score: score });
                        }
                    }
                }

                // Index prefixes
                const nameLower = show.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Process full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);
                    if (!prefixGroups[prefix]) {
                        prefixGroups[prefix] = new Set();
                    }
                    prefixGroups[prefix].add(show.token);
                }

                // Process word prefixes
                for (const word of words) {
                    if (word.length < 2) continue;
                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(show.token);
                    }
                }
            }

            // Add genres to shows
            const showGenres = await conn('tv_shows_genres AS sg')
                .join('tv_genres AS g', 'g.id', 'sg.genre_id')
                .whereNull('sg.deleted')
                .select('sg.show_id', 'g.token', 'g.name');

            for (const sg of showGenres) {
                if (showsDict[sg.show_id]) {
                    showsDict[sg.show_id].genres[sg.token] = {
                        token: sg.token,
                        name: sg.name,
                    };
                }
            }

            // Sort and store top items for each group
            // Popular shows
            const topPopular = popularShows
                .sort((a, b) => b.score - a.score)
                .slice(0, topShowsCount)
                .map((s) => s.token);

            pipeline.del(cacheService.keys.tv_popular);
            pipeline.sAdd(cacheService.keys.tv_popular, topPopular);

            // Decade groups
            for (const [decade, shows] of Object.entries(decadeGroups)) {
                const showsKey = cacheService.keys.tv_decade_shows(decade + 's');
                const topKey = cacheService.keys.tv_decade_top_shows(decade + 's');

                // Store all shows for this decade
                pipeline.del(showsKey);
                pipeline.sAdd(
                    showsKey,
                    Array.from(shows).map((s) => s.token),
                );

                // Store top shows for this decade
                const topShows = Array.from(shows)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topShowsCount)
                    .map((s) => s.token);

                pipeline.del(topKey);
                pipeline.sAdd(topKey, topShows);
            }

            // Network groups
            for (const [network, shows] of Object.entries(networkGroups)) {
                const showsKey = cacheService.keys.tv_network_shows(network);
                const topKey = cacheService.keys.tv_network_top_shows(network);

                // Store all shows for this network
                pipeline.del(showsKey);
                pipeline.sAdd(
                    showsKey,
                    Array.from(shows).map((s) => s.token),
                );

                // Store top shows for this network
                const topShows = Array.from(shows)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topShowsCount)
                    .map((s) => s.token);

                pipeline.del(topKey);
                pipeline.sAdd(topKey, topShows);
            }

            // Store show data and prefixes
            pipeline.hSet(cacheService.keys.tv_shows, showsAll);

            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                const key = cacheService.keys.tv_prefix(prefix);
                pipeline.del(key);
                pipeline.sAdd(key, Array.from(tokens));
            }

            await pipeline.execAsPipeline();

            console.log({
                total_shows: shows.length,
                with_genres: showGenres.length,
                prefixes: Object.keys(prefixGroups).length,
                decades: Object.keys(decadeGroups).length,
                networks: Object.keys(networkGroups).length,
            });
        } catch (e) {
            console.error('Error in indexTvShows:', e);
            return reject(e);
        }

        resolve();
    });
}

function indexTvGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all genres
            let genres = await conn('tv_genres').whereNull('deleted');

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
                    tmdb_id: genre.tmdb_id,
                });
                return acc;
            }, {});

            // Get all genre associations with shows
            let shows_genres = await conn('tv_shows_genres AS sg')
                .join('tv_shows AS s', 's.id', '=', 'sg.show_id')
                .whereNull('sg.deleted')
                .whereNull('s.deleted')
                .select(
                    's.token AS show_token',
                    's.name',
                    's.tmdb_poster_path',
                    's.first_air_date',
                    's.year_from',
                    's.year_to',
                    's.vote_count',
                    's.vote_average',
                    's.networks',
                    'sg.genre_id',
                );

            // Organize by genre
            const genreShows = {};
            const genreTopShows = {};

            for (const genre of genres) {
                genreShows[genre.token] = new Set();
                genreTopShows[genre.token] = [];
            }

            // Process associations and calculate scores
            for (const sg of shows_genres) {
                const genre = genresDict[sg.genre_id];
                if (!genre) continue;

                const showScore = calculateShowScore({
                    vote_count: sg.vote_count,
                    vote_average: sg.vote_average,
                });

                genreShows[genre.token].add(sg.show_token);

                genreTopShows[genre.token].push({
                    show_token: sg.show_token,
                    score: showScore,
                });
            }

            // Store in Redis
            // 1. Store all genres
            pipeline.hSet(cacheService.keys.tv_genres, genresAll);

            // 2. Store genre associations and top shows
            for (const [genreToken, showTokens] of Object.entries(genreShows)) {
                // Store all shows for this genre
                const showsKey = cacheService.keys.tv_genre_shows(genreToken);
                pipeline.del(showsKey);
                if (showTokens.size > 0) {
                    pipeline.sAdd(showsKey, Array.from(showTokens));
                }

                // Store top shows for this genre
                const topKey = cacheService.keys.tv_genre_top_shows(genreToken);
                pipeline.del(topKey);

                const topShows = genreTopShows[genreToken]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topShowsCount)
                    .map((s) => s.show_token);

                if (topShows.length > 0) {
                    pipeline.sAdd(topKey, topShows);
                }
            }

            await pipeline.execAsPipeline();

            console.log({
                genres_processed: genres.length,
                shows_genres_processed: shows_genres.length,
                genres_with_shows: Object.keys(genreShows).filter((k) => genreShows[k].size > 0)
                    .length,
            });
        } catch (e) {
            console.error('Error in indexTvGenres:', e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main: async function () {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Indexing TV show data');
                await cacheService.init();

                await deletePreviousCustomKeys();

                console.log('Indexing TV shows...');
                await indexTvShows();

                console.log('Indexing TV genres...');
                await indexTvGenres();

                console.log('TV show indexing completed');
                resolve();
            } catch (e) {
                console.error('Error in main indexing execution:', e);
                reject(e);
            }
        });
    },
};

if (require.main === module) {
    (async function () {
        try {
            await module.exports.main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}
