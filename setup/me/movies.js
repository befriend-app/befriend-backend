const axios = require('axios');
const { loadScriptEnv, timeNow, generateToken, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');
const {keys: systemKeys} = require('../../services/system');

loadScriptEnv();

function syncGenres() {
    console.log("Sync movie genres");

    const main_table = 'movie_genres';
    let added = 0;
    let updated = 0;
    let batch_insert = [];
    let batch_update = [];

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Genres lookup
            let genres_dict = {};
            let genres = await conn(main_table);

            for(let genre of genres) {
                genres_dict[genre.token] = genre;
            }

            let endpoint = dataEndpoint(`/movie-genres`);
            let r = await axios.get(endpoint);

            for(let item of r.data.items) {
                let existing = genres_dict[item.token];

                if(!existing) {
                    let new_item = {
                        token: item.token,
                        name: item.name,
                        tmdb_id: item.tmdb_id,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    batch_insert.push(new_item);
                    added++;
                } else if(item.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: item.name,
                        updated: timeNow()
                    };

                    batch_update.push(update_obj);
                    updated++;
                }
            }

            if(batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if(batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({ added, updated });
            resolve();

        } catch(e) {
            console.error('Error syncing genres:', e);
            reject(e);
        }
    });
}

function syncMovies() {
    console.log("Sync movies");

    const main_table = 'movies';
    let added = 0;
    let updated = 0;
    let batch_insert = [];
    let batch_update = [];

    const BATCH_SIZE = 10000;

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Last sync time
            let last_sync = await conn('sync')
                .where('sync_process', systemKeys.sync.data.movies.all)
                .first();

            // Movies lookup
            let movies_dict = {};
            let movies = await conn(main_table);

            for(let movie of movies) {
                movies_dict[movie.token] = movie;
            }

            let offset = 0;
            let hasMore = true;
            let saveTimestamp = null;

            while(hasMore) {
                let endpoint = dataEndpoint(`/movies?offset=${offset}`);

                if(last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Syncing movies: offset ${offset}`);

                let r = await axios.get(endpoint);
                let {items, next_offset, has_more, timestamp} = r.data;

                if(!has_more) {
                    saveTimestamp = timestamp;
                }

                if(!items.length) {
                    break;
                }

                for(let item of items) {
                    let existing = movies_dict[item.token];

                    if(!existing) {
                        if(item.deleted) {
                            continue;
                        }

                        let new_item = {
                            token: item.token,
                            tmdb_id: item.tmdb_id,
                            name: item.name,
                            tmdb_poster_path: item.tmdb_poster_path,
                            original_language: item.original_language,
                            release_date: item.release_date,
                            popularity: item.popularity,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;

                        if(batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert(main_table, batch_insert);
                            batch_insert = [];
                        }
                    } else if(item.updated > existing.updated) {
                        let update_obj = {
                            id: existing.id,
                            name: item.name,
                            tmdb_poster_path: item.tmdb_poster_path,
                            popularity: item.popularity,
                            updated: timeNow(),
                            deleted: item.deleted ? timeNow() : null
                        };

                        batch_update.push(update_obj);
                        updated++;

                        if(batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process remaining batch items
                if(batch_insert.length) {
                    await dbService.batchInsert(main_table, batch_insert);
                    batch_insert = [];
                }

                if(batch_update.length) {
                    await dbService.batchUpdate(main_table, batch_update);
                    batch_update = [];
                }

                // Update offset and hasMore based on API response
                hasMore = has_more;

                if(next_offset !== null) {
                    offset = next_offset;
                } else {
                    hasMore = false;
                }

                console.log({
                    processed: items.length,
                    added,
                    updated,
                    offset
                });

                // Add delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Update sync table with last sync time
            if(last_sync) {
                await conn('sync')
                    .where('id', last_sync.id)
                    .update({
                        last_updated: timeNow(),
                        updated: timeNow()
                    });
            } else {
                await conn('sync')
                    .insert({
                        sync_process: systemKeys.sync.data.movies.all,
                        last_updated: timeNow(),
                        created: timeNow(),
                        updated: timeNow()
                    });
            }

            console.log({ added, updated });
            resolve();

        } catch(e) {
            console.error('Error syncing movies:', e);
            reject(e);
        }
    });
}

function syncMoviesGenres() {
    console.log("Sync movies-genres");

    const main_table = 'movies_genres';
    let added = 0;
    let updated = 0;
    let batch_insert = [];
    let batch_update = [];

    const BATCH_SIZE = 10000;

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Last sync time
            let last_sync = await conn('sync')
                .where('sync_process', systemKeys.sync.data.movies.genres)
                .first();

            // Get lookup dictionaries
            let [movies, genres] = await Promise.all([
                conn('movies').select('id', 'token'),
                conn('movie_genres').select('id', 'token')
            ]);

            let movies_dict = {};
            let genres_dict = {};

            for(let movie of movies) {
                movies_dict[movie.token] = movie;
            }

            for(let genre of genres) {
                genres_dict[genre.token] = genre;
            }

            // Get existing associations
            let existing = await conn(main_table);
            let assoc_dict = {};

            for(let assoc of existing) {
                if(!assoc_dict[assoc.movie_id]) {
                    assoc_dict[assoc.movie_id] = {};
                }
                assoc_dict[assoc.movie_id][assoc.genre_id] = assoc;
            }

            let offset = 0;
            let hasMore = true;

            while(hasMore) {
                let endpoint = dataEndpoint(`/movies/genres?offset=${offset}`);

                if(last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Syncing movie genres: offset ${offset}`);

                let r = await axios.get(endpoint);
                let {items, next_offset, has_more} = r.data;

                if(!items.length) {
                    break;
                }

                for(let item of items) {
                    const movie = movies_dict[item.movie_token];
                    const genre = genres_dict[item.genre_token];

                    if(!movie || !genre) {
                        console.warn(`Invalid association: movie=${item.movie_token}, genre=${item.genre_token}`);
                        continue;
                    }

                    const existing_assoc = assoc_dict[movie.id]?.[genre.id];

                    if(!existing_assoc) {
                        if(item.deleted) {
                            continue;
                        }

                        let new_item = {
                            movie_id: movie.id,
                            genre_id: genre.id,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;

                        if(batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert(main_table, batch_insert);
                            batch_insert = [];
                        }
                    } else if(item.updated > existing_assoc.updated) {
                        let update_obj = {
                            id: existing_assoc.id,
                            updated: timeNow(),
                            deleted: item.deleted ? timeNow() : null
                        };

                        batch_update.push(update_obj);
                        updated++;

                        if(batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process remaining batch items
                if(batch_insert.length) {
                    await dbService.batchInsert(main_table, batch_insert);
                    batch_insert = [];
                }

                if(batch_update.length) {
                    await dbService.batchUpdate(main_table, batch_update);
                    batch_update = [];
                }

                // Update offset and hasMore based on API response
                hasMore = has_more;

                if(next_offset !== null) {
                    offset = next_offset;
                } else {
                    hasMore = false;
                }

                console.log({
                    processed: items.length,
                    added,
                    updated,
                    offset
                });

                // Add delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Update sync table
            if(last_sync) {
                await conn('sync')
                    .where('id', last_sync.id)
                    .update({
                        last_updated: timeNow(),
                        updated: timeNow()
                    });
            } else {
                await conn('sync')
                    .insert({
                        sync_process: systemKeys.sync.data.movies.genres,
                        last_updated: timeNow(),
                        created: timeNow(),
                        updated: timeNow()
                    });
            }

            console.log({ added, updated });
            resolve();

        } catch(e) {
            console.error('Error syncing movie genres:', e);
            reject(e);
        }
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Sync movies");

            await cacheService.init();

            await syncGenres();
            await syncMovies();
            await syncMoviesGenres();

            // await require('../index/index_movies').main();
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}