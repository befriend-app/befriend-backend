const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { prefixLimit, topGenreArtistsCount } = require('../../services/music');

loadScriptEnv();

function indexGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            const genres = await conn('music_genres')
                    .orderBy('position');

            const genresDict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            // Organize data structures for Redis
            const genresAll = {};
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
                    position: genre.position,
                    updated: genre.updated,
                    deleted: genre.deleted ? 1 : '',
                });

                // Index genre name prefixes
                const nameLower = genre.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);

                    if (genre.deleted || !genre.is_active) {
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

                        if (genre.deleted || !genre.is_active) {
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

            // Add to Redis in batches
            // 1. Store all genres
            pipeline.hSet(cacheService.keys.music_genres, genresAll);

            // 2. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(
                    cacheService.keys.music_genres_prefix(prefix),
                    Array.from(tokens)
                );
            }

            // 3. Remove deleted items from prefix sets
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

function indexArtists() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            // Get all artists w/ spotify followers
            const artists = await conn('music_artists')
                .whereNotNull('spotify_followers')
                .orderBy('id')
                .select(
                    'id',
                    'token',
                    'name',
                    'spotify_popularity AS popularity',
                    'spotify_followers AS followers',
                    'is_active',
                    'updated',
                    'deleted'
                );

            let artists_dict = artists.reduce((acc, artist) => {
                acc[artist.id] = artist;
                return acc;
            }, {});

            let genres = await conn('music_genres');
            let genres_dict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            let artists_genres = await conn('music_artists_genres');

            let artists_genres_dict = artists_genres.reduce((acc, ag) => {
                let artist = artists_dict[ag.artist_id];
                let genre = genres_dict[ag.genre_id];

                if(!(artist.id in acc)) {
                    acc[artist.id] = {};
                }

                acc[artist.id][genre.token] = {
                    id: genre.id,
                    token: genre.token,
                    name: genre.name,
                }

                return acc;
            }, {});

            // Organize data structures for Redis
            const artistsAll = {};
            const prefixGroups = {};
            const deletePrefixGroups = {};

            // Process all artists
            for (const artist of artists) {
                let artist_genres = artists_genres_dict[artist.id];

                // Store complete artist data
                artistsAll[artist.token] = JSON.stringify({
                    id: artist.id,
                    token: artist.token,
                    name: artist.name,
                    popularity: artist.popularity,
                    followers: artist.followers,
                    active: artist.is_active ? 1 : '',
                    updated: artist.updated,
                    deleted: artist.deleted ? 1 : '',
                    genres: artist_genres
                });

                // Index artist name prefixes
                const nameLower = artist.name.toLowerCase();
                const words = nameLower.split(/\s+/);

                // Full name prefixes
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);

                    if (artist.deleted || !artist.is_active) {
                        if (!deletePrefixGroups[prefix]) {
                            deletePrefixGroups[prefix] = new Set();
                        }
                        deletePrefixGroups[prefix].add(artist.token);
                    } else {
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = new Set();
                        }
                        prefixGroups[prefix].add(artist.token);
                    }
                }

                // Word prefixes
                for (const word of words) {
                    if (word.length < 2) continue;
                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);

                        if (artist.deleted || !artist.is_active) {
                            if (!deletePrefixGroups[prefix]) {
                                deletePrefixGroups[prefix] = new Set();
                            }
                            deletePrefixGroups[prefix].add(artist.token);
                        } else {
                            if (!prefixGroups[prefix]) {
                                prefixGroups[prefix] = new Set();
                            }
                            prefixGroups[prefix].add(artist.token);
                        }
                    }
                }
            }

            // Add to Redis in batches
            // 1. Store all artists
            pipeline.hSet(cacheService.keys.music_artists, artistsAll);

            // 2. Store prefix indexes
            for (const [prefix, tokens] of Object.entries(prefixGroups)) {
                pipeline.sAdd(
                    cacheService.keys.music_artists_prefix(prefix),
                    Array.from(tokens)
                );
            }

            // 3. Remove deleted items from prefix sets
            for (const [prefix, tokens] of Object.entries(deletePrefixGroups)) {
                if (tokens.size > 0) {
                    pipeline.sRem(
                        cacheService.keys.music_artists_prefix(prefix),
                        Array.from(tokens)
                    );
                }
            }

            await pipeline.execAsPipeline();

        } catch (e) {
            console.error('Error in indexArtists:', e);
            return reject(e);
        }

        resolve();
    });
}

function indexArtistsGenres() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let pipeline = cacheService.startPipeline();

            let genres = await conn('music_genres');

            let genres_dict = genres.reduce((acc, genre) => {
                acc[genre.id] = genre;
                return acc;
            }, {});

            let artists = await conn('music_artists');

            let artists_dict = artists.reduce((acc, artist) => {
                acc[artist.id] = artist;
                return acc;
            }, {});

            let artists_genres = await conn('music_artists_genres AS mag')
                .join('music_artists AS ma', 'ma.id', '=', 'mag.artist_id')
                .orderBy('followers', 'desc')
                .select('ma.spotify_followers AS followers', 'ma.spotify_popularity AS popularity',
                    'artist_id', 'genre_id', 'mag.deleted');

            // Organize data by genre
            const genreArtists = {};
            const genreTopArtists = {};

            for(let ag of artists_genres) {
                let artist = artists_dict[ag.artist_id];
                let genre = genres_dict[ag.genre_id];

                if(artist.deleted || ag.deleted) {
                   //do nothing
                } else {
                    if(!(genre.token in genreArtists)) {
                        genreArtists[genre.token] = {};
                    }

                    if(!(genre.token in genreTopArtists)) {
                        genreTopArtists[genre.token] = [];
                    }

                    genreArtists[genre.token][artist.token] = {
                        artist_token: artist.token,
                        followers: artist.followers,
                        popularity: ag.popularity,
                    }

                    if(genreTopArtists[genre.token].length < topGenreArtistsCount) {
                        genreTopArtists[genre.token].push({
                            artist_token: artist.token,
                            followers: artist.followers,
                            popularity: ag.popularity,
                        });
                    }
                }
            }

            // Add to Redis
            for (const genreToken of Object.keys(genreArtists)) {
                // 1. Store complete artist data for this genre
                const stringifiedArtists = {};
                for (const [key, value] of Object.entries(genreArtists[genreToken])) {
                    stringifiedArtists[key] = JSON.stringify(value);
                }

                pipeline.hSet(
                    cacheService.keys.music_genre_artists(genreToken),
                    stringifiedArtists
                );

                // 2. Store top artists for this genre
                const topArtists = genreTopArtists[genreToken];

                if (topArtists.length) {
                    let key = cacheService.keys.music_genre_top_artists(genreToken);

                    pipeline.set(
                        key,
                        JSON.stringify(topArtists)
                    );
                }
            }

            await pipeline.execAsPipeline();
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}


module.exports = {
    main: async function() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Indexing music data');
                await cacheService.init();

                console.log('Indexing genres...');
                await indexGenres();

                console.log('Indexing artists...');
                await indexArtists();

                console.log('Indexing artists-genres...');
                await indexArtistsGenres();

                console.log("Music indexing completed");
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