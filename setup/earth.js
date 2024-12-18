const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint, timeoutAwait } = require('../services/shared');
const dbService = require('../services/db');
const cacheService = require('../services/cache');
const { keys: systemKeys } = require('../services/system');

loadScriptEnv();

const sync_name = systemKeys.sync.data.earth;

let db_dict_grid = {};

async function syncEarthGrid() {
    return new Promise(async (resolve, reject) => {
        console.log('Sync earth grid');

        let main_table = 'earth_grid';
        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];
        const BATCH_SIZE = 10000;

        try {
            let conn = await dbService.conn();

            // Get last sync time
            let last_sync = await conn('sync').where('sync_process', sync_name).first();

            // Load existing grid cells into dictionary
            let previous = await conn(main_table)
                .select('id', 'token', 'lat_key', 'lon_key', 'center_lat', 'center_lon', 'grid_size_km', 'updated', 'deleted');

            for (let item of previous) {
                db_dict_grid[item.token] = item;
            }

            let offset = 0;
            let hasMore = true;
            let saveTimestamp = null;

            while (hasMore) {
                let endpoint = dataEndpoint(`/earth?offset=${offset}`);

                if (last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Fetching earth grid cells with offset ${offset}`);

                let r = await axios.get(endpoint);

                let { items, next_offset, has_more, timestamp } = r.data;

                if (!has_more) {
                    saveTimestamp = timestamp;
                }

                if (!items.length) {
                    break;
                }

                for (let item of items) {
                    let db_item = db_dict_grid[item.token];

                    if (!db_item) {
                        if(item.deleted) {
                            continue;
                        }

                        // New grid cell
                        let new_item = {
                            token: item.token,
                            lat_key: item.lat_key,
                            lon_key: item.lon_key,
                            center_lat: item.center_lat,
                            center_lon: item.center_lon,
                            grid_size_km: item.grid_size_km,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;

                        if (batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert(main_table, batch_insert);
                            batch_insert = [];
                        }
                    } else if (item.updated > db_item.updated) {
                        // Update existing grid cell
                        let update_obj = structuredClone(db_item);
                        let has_changes = false;

                        for (let k in item) {
                            if (k === 'updated') {
                                continue;
                            }

                            if (db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                                has_changes = true;
                            }
                        }

                        if (has_changes) {
                            update_obj.updated = timeNow();
                            batch_update.push(update_obj);
                            updated++;
                        }

                        if (batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process any remaining batch items
                if (batch_insert.length) {
                    await dbService.batchInsert(main_table, batch_insert);
                    batch_insert = [];
                }

                if (batch_update.length) {
                    await dbService.batchUpdate(main_table, batch_update);
                    batch_update = [];
                }

                // Update offset and hasMore based on API response
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
                    offset
                });

                await timeoutAwait(1000);
            }

            // Update sync table with last sync time
            if (last_sync) {
                await conn('sync').where('id', last_sync.id).update({
                    last_updated: timeNow(),
                    updated: timeNow()
                });
            } else {
                await conn('sync').insert({
                    sync_process: sync_name,
                    last_updated: timeNow(),
                    created: timeNow(),
                    updated: timeNow()
                });
            }

            console.log({
                added,
                updated
            });
        } catch (e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();
            await syncEarthGrid();
            console.log('Earth grid sync completed');
        } catch (e) {
            console.error(e);
        }
        resolve();
    });
}

module.exports = {
    main: main
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}