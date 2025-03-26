const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint, timeoutAwait } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');
const { keys: systemKeys } = require('../../system');

loadScriptEnv();

function syncTvGenres() {
    console.log('Sync TV genres');

    const main_table = 'tv_genres';
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

            for (let genre of genres) {
                genres_dict[genre.tmdb_id] = genre;
            }

            let endpoint = dataEndpoint(`/tv/genres`);
            let r = await axios.get(endpoint);

            for (let item of r.data.items) {
                let existing = genres_dict[item.tmdb_id];

                if (!existing) {
                    if (item.deleted) {
                        continue;
                    }

                    let new_item = {
                        tmdb_id: item.tmdb_id,
                        token: item.token,
                        name: item.name,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    batch_insert.push(new_item);
                    added++;
                } else if (item.updated > existing.updated) {
                    let update_obj = {
                        id: existing.id,
                        name: item.name,
                        updated: timeNow(),
                        deleted: item.deleted ? timeNow() : null,
                    };

                    batch_update.push(update_obj);
                    updated++;
                }
            }

            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing TV genres:', e);
            reject(e);
        }
    });
}

function syncTvShows() {
    console.log('Sync TV shows');

    const main_table = 'tv_shows';
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
                .where('sync_process', systemKeys.sync.data.tv.shows)
                .first();

            // Shows lookup
            let shows_dict = {};
            let shows = await conn(main_table);

            for (let show of shows) {
                shows_dict[show.token] = show;
            }

            let offset = 0;
            let hasMore = true;
            let saveTimestamp = null;

            while (hasMore) {
                let endpoint = dataEndpoint(`/tv/shows?offset=${offset}`);

                if (last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Syncing TV shows: offset ${offset}`);

                let r = await axios.get(endpoint);
                let { items, next_offset, has_more, timestamp } = r.data;

                if (!has_more) {
                    saveTimestamp = timestamp;
                }

                if (!items.length) {
                    break;
                }

                for (let item of items) {
                    let existing = shows_dict[item.token];

                    if (!existing) {
                        if (item.deleted) {
                            continue;
                        }

                        let new_item = {
                            token: item.token,
                            tmdb_id: item.tmdb_id,
                            name: item.name,
                            tmdb_poster_path: item.tmdb_poster_path,
                            original_language: item.original_language,
                            first_air_date: item.first_air_date,
                            year_from: item.year_from,
                            year_to: item.year_to,
                            popularity: item.popularity,
                            vote_average: item.vote_average,
                            vote_count: item.vote_count,
                            networks: item.networks,
                            origin_country: item.origin_country,
                            season_count: item.season_count,
                            episode_count: item.episode_count,
                            is_ended: item.is_ended,
                            created: timeNow(),
                            updated: timeNow(),
                        };

                        batch_insert.push(new_item);
                        added++;

                        if (batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert(main_table, batch_insert);
                            batch_insert = [];
                        }
                    } else if (item.updated > existing.updated) {
                        let update_obj = {
                            id: existing.id,
                            name: item.name,
                            popularity: item.popularity,
                            vote_average: item.vote_average,
                            vote_count: item.vote_count,
                            year_to: item.year_to,
                            networks: item.networks,
                            season_count: item.season_count,
                            episode_count: item.episode_count,
                            is_ended: item.is_ended,
                            updated: timeNow(),
                            deleted: item.deleted ? timeNow() : null,
                        };

                        batch_update.push(update_obj);
                        updated++;

                        if (batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process remaining batches
                if (batch_insert.length) {
                    await dbService.batchInsert(main_table, batch_insert);
                    batch_insert = [];
                }

                if (batch_update.length) {
                    await dbService.batchUpdate(main_table, batch_update);
                    batch_update = [];
                }

                hasMore = has_more;

                if (next_offset !== null) {
                    offset = next_offset;
                } else {
                    hasMore = false;
                }

                console.log({
                    processed: items.length,
                    added,
                    updated,
                    offset,
                });

                await timeoutAwait(1000);
            }

            // Update sync table with last sync time
            if (last_sync) {
                await conn('sync').where('id', last_sync.id).update({
                    last_updated: timeNow(),
                    updated: timeNow(),
                });
            } else {
                await conn('sync').insert({
                    sync_process: systemKeys.sync.data.tv.shows,
                    last_updated: timeNow(),
                    created: timeNow(),
                    updated: timeNow(),
                });
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing TV shows:', e);
            reject(e);
        }
    });
}

function syncTvShowsGenres() {
    console.log('Sync TV shows-genres');

    const main_table = 'tv_shows_genres';

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
                .where('sync_process', systemKeys.sync.data.tv.genres)
                .first();

            // Get lookup dictionaries
            const [shows, genres] = await Promise.all([
                conn('tv_shows').select('id', 'token'),
                conn('tv_genres').select('id', 'token'),
            ]);

            let shows_dict = shows.reduce((acc, s) => {
                acc[s.token] = s.id;
                return acc;
            }, {});

            let genres_dict = genres.reduce((acc, g) => {
                acc[g.token] = g.id;
                return acc;
            }, {});

            // Get existing associations
            let existing = await conn(main_table);
            let assoc_dict = {};

            for (let assoc of existing) {
                if (!assoc_dict[assoc.show_id]) {
                    assoc_dict[assoc.show_id] = {};
                }
                assoc_dict[assoc.show_id][assoc.genre_id] = assoc;
            }

            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                let endpoint = dataEndpoint(`/tv/shows/genres?offset=${offset}`);

                if (last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Syncing TV show genres: offset ${offset}`);

                let r = await axios.get(endpoint);
                let { items, next_offset, has_more } = r.data;

                if (!items.length) {
                    break;
                }

                for (let item of items) {
                    const show_id = shows_dict[item.show_token];
                    const genre_id = genres_dict[item.genre_token];

                    if (!show_id || !genre_id) {
                        console.error('Show/genre not found');
                        continue;
                    }

                    const existing_assoc = assoc_dict[show_id]?.[genre_id];

                    if (!existing_assoc) {
                        if (item.deleted) continue;

                        let new_item = {
                            show_id: show_id,
                            genre_id: genre_id,
                            created: timeNow(),
                            updated: timeNow(),
                        };

                        batch_insert.push(new_item);
                        added++;

                        if (batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert(main_table, batch_insert);
                            batch_insert = [];
                        }
                    } else if (item.updated > existing_assoc.updated) {
                        let update_obj = {
                            id: existing_assoc.id,
                            updated: timeNow(),
                            deleted: item.deleted ? timeNow() : null,
                        };

                        batch_update.push(update_obj);
                        updated++;

                        if (batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process remaining batches
                if (batch_insert.length) {
                    await dbService.batchInsert(main_table, batch_insert);
                    batch_insert = [];
                }

                if (batch_update.length) {
                    await dbService.batchUpdate(main_table, batch_update);
                    batch_update = [];
                }

                hasMore = has_more;
                if (next_offset !== null) {
                    offset = next_offset;
                } else {
                    hasMore = false;
                }

                console.log({
                    processed: items.length,
                    added,
                    updated,
                    offset,
                });

                await timeoutAwait(1000);
            }

            // Update sync table
            if (last_sync) {
                await conn('sync').where('id', last_sync.id).update({
                    last_updated: timeNow(),
                    updated: timeNow(),
                });
            } else {
                await conn('sync').insert({
                    sync_process: systemKeys.sync.data.tv.genres,
                    last_updated: timeNow(),
                    created: timeNow(),
                    updated: timeNow(),
                });
            }

            console.log({ added, updated });
            resolve();
        } catch (e) {
            console.error('Error syncing TV show genres:', e);
            reject(e);
        }
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Sync TV shows');

            await cacheService.init();

            await syncTvGenres();
            await syncTvShows();
            await syncTvShowsGenres();

            await require('../index/index_tv').main();
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main,
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
