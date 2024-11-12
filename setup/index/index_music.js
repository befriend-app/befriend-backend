const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

loadScriptEnv();

const BATCH_SIZE = 5000;

function indexGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.conn.multi();

            // Get all required data in parallel
            const [countries, genres, countryGenres] = await Promise.all([
                conn('open_countries').orderBy('id'),
                conn('music_genres')
                    .orderBy('id'),
                conn('music_genres_countries')
                    .orderBy(['country_id', 'position'])
            ]);

            // Create lookup dictionaries
            const countriesDict = countries.reduce((acc, country) => {
                acc[country.id] = country;
                return acc;
            }, {});

            const genresDict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            // Organize data structures for Redis
            const genresAll = {};
            const genresByCountry = {};
            const prefixGroups = {};
            const deletePrefixGroups = {};

            // Process all genres first
            for (const genre of genres) {
                genresAll[genre.token] = JSON.stringify({
                    id: genre.id,
                    token: genre.token,
                    name: genre.name,
                    parent_token: genre.parent_id ? genresDict[genre.parent_id]?.token : '',
                    is_active: genre.is_active ? 1 : '',
                    updated: genre.updated,
                    deleted: genre.deleted ? 1 : '',
                });

                // Index genre name prefixes
                const nameLower = genre.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Full name prefixes
                for (let i = 1; i <= nameLower.length; i++) {
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
                    for (let i = 1; i <= word.length; i++) {
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

            // Process country associations
            for (const countryGenre of countryGenres) {
                const genre = genresDict[countryGenre.genre_id];
                if (!genre) continue;

                const countryCode = countriesDict[countryGenre.country_id].country_code;

                if (!genresByCountry[countryCode]) {
                    genresByCountry[countryCode] = {};
                }

                genresByCountry[countryCode][genre.token] = JSON.stringify({
                    token: genre.token,
                    position: countryGenre.position,
                    updated: countryGenre.updated,
                    deleted: countryGenre.deleted ? 1 : '',
                });
            }

            // Add to Redis in batches
            // 1. Store all genres
            pipeline.hSet(cacheService.keys.music_genres, genresAll);

            // 2. Store country-specific genres
            for (const [countryCode, countryGenres] of Object.entries(genresByCountry)) {
                pipeline.hSet(cacheService.keys.music_country_genres(countryCode), countryGenres);
            }

            // 3. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(
                    cacheService.keys.music_genres_prefix(prefix),
                    Array.from(tokens)
                );
            }

            // 4. Remove deleted items from prefix sets
            for (const [prefix, tokens] of Object.entries(deletePrefixGroups)) {
                if (tokens.size > 0) {
                    pipeline.sRem(
                        cacheService.keys.music_genres_prefix(prefix),
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

module.exports = {
    main: async function() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Index Music Genres');
                await cacheService.init();
                await indexGenres();
                console.log("Index completed");
                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }
};

if (require.main === module) {
    (async function() {
        await module.exports.main();
        process.exit();
    })();
}