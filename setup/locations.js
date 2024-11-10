const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../services/shared');
const dbService = require('../services/db');
const cacheService = require('../services/cache');
const { batchInsert, batchUpdate } = require('../services/db');

loadScriptEnv();

let db_dict_countries = {};
let db_dict_states = {};
let db_dict_cities = {};

async function syncCountries() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync countries");

        let added = 0;
        let updated = 0;

        try {
            let conn = await dbService.conn();

            let previous = await conn('open_countries');

            for(let item of previous) {
                db_dict_countries[item.country_code] = item;
            }

            let endpoint = dataEndpoint(`/countries`);

            let r = await axios.get(endpoint);

            let update_cache = false;

            for(let item of r.data.items) {
                let db_item = db_dict_countries[item.country_code];

                if(!db_item) {
                    update_cache = true;
                    let new_item = structuredClone(item);
                    new_item.created = timeNow();
                    new_item.updated = timeNow();

                    let [id] = await conn('open_countries')
                        .insert(new_item);

                    added++;

                    new_item.id = id;

                    db_dict_countries[item.country_code] = new_item;
                } else {
                    if(item.updated > db_item.updated) {
                        update_cache = true;

                        let update_obj = {};

                        for(let k in item) {
                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                            }
                        }

                        if(Object.keys(update_obj).length) {
                            update_obj.updated = timeNow();

                            await conn('open_countries')
                                .where('id', db_item.id)
                                .update(update_obj);

                            updated++;
                        }
                    }
                }
            }

            if(update_cache) {
                await cacheService.deleteKeys(cacheService.keys.countries);
            }

            console.log({
                added,
                updated
            });
        } catch(e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

async function syncStates() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync states");

        try {
            let conn = await dbService.conn();

            let previous = await conn('open_states AS os')
                .join('open_countries AS oc', 'os.country_id', '=', 'oc.id')
                .select('os.*', 'oc.country_code')

            for(let item of previous) {
                db_dict_states[item.token] = item;
            }

            let endpoint = dataEndpoint(`/states`);

            let r = await axios.get(endpoint);

            let batch_insert = [];
            let batch_update = [];

            for(let item of r.data.items) {
                let db_item = db_dict_states[item.token];

                if(!db_item) {
                    let new_item = structuredClone(item);

                    delete new_item.country_code;

                    db_dict_states[item.token] = new_item;

                    new_item.country_id = db_dict_countries[item.country_code].id;
                    new_item.created = timeNow();
                    new_item.updated = timeNow();

                    batch_insert.push(new_item);
                } else {
                    if(item.updated > db_item.updated) {
                        delete item.country_code;
                        delete db_item.country_code;

                        let update_obj = structuredClone(db_item);

                        let has_changes = false;

                        for(let k in item) {
                            if(k === 'updated') {
                                continue;
                            }

                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                                has_changes = true;
                            }
                        }

                        if(has_changes) {
                            update_obj.updated = timeNow();

                            batch_update.push(update_obj);
                        }
                    }
                }
            }

            //batch insert
            if(batch_insert.length) {
                try {
                    await batchInsert('open_states', batch_insert, true)

                    console.log({
                        added: batch_insert.length,
                    });
                } catch(e) {
                    console.error(e);
                }
            }

            if(batch_update.length) {
                try {
                    await batchUpdate('open_states', batch_update)

                    console.log({
                        updated: batch_update.length
                    });
                } catch(e) {
                    console.error(e);
                }
            }

        } catch(e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

async function syncCities() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync cities");

        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];
        const BATCH_SIZE = 10000;
        const sync_name = 'sync_open_locations';

        try {
            let conn = await dbService.conn();

            // Last sync time
            let last_sync = await conn('sync')
                .where('sync_process', sync_name)
                .first();

            // Countries lookup
            let countries = await conn('open_countries');
            let countries_dict = {};

            for(let country of countries) {
                countries_dict[country.country_code] = country;
            }

            // States lookup
            let states = await conn('open_states');
            let states_dict = {};

            for(let state of states) {
                states_dict[state.token] = state;
            }

            // Existing cities
            let previous = await conn('open_cities');

            for(let item of previous) {
                if(!(item.country_id in db_dict_cities)) {
                    db_dict_cities[item.country_id] = {};
                }

                if(!(item.state_id in db_dict_cities[item.country_id])) {
                    db_dict_cities[item.country_id][item.state_id] = {};
                }
                db_dict_cities[item.country_id][item.state_id][item.city_name.toLowerCase()] = item;
            }

            let offset = 0;
            let hasMore = true;
            let saveTimestamp = null;

            while(hasMore) {
                let endpoint = dataEndpoint(`/cities?offset=${offset}`);

                if(last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Fetching cities with offset ${offset}`);

                let r = await axios.get(endpoint);

                let {items, next_offset, has_more, timestamp} = r.data;

                if(!has_more) {
                    saveTimestamp = timestamp;
                }

                if(!items.length) {
                    break;
                }

                for(let item of items) {
                    // Get country and state IDs from lookup dictionaries
                    let country = countries_dict[item.country_code];
                    if (!country) {
                        console.warn(`Country not found: ${item.country_code}`);
                        continue;
                    }

                    let state = item.state_name ? states_dict[country.id]?.[item.state_name] : null;

                    if (item.state_name && !state) {
                        console.warn(`State not found: ${item.state_name} for country ${item.country_code}`);
                        continue;
                    }

                    let lookup_key = item.city_name.toLowerCase();

                    let db_item = state ?
                        db_dict_cities[country.id]?.[state.id]?.[lookup_key] :
                        db_dict_cities[country.id]?.['null']?.[lookup_key];

                    if(!db_item) {
                        let new_item = {
                            country_id: country.id,
                            state_id: state?.id || null,
                            city_name: item.city_name,
                            population: item.population,
                            lat: item.lat,
                            lon: item.lon,
                            postcode: item.postcode,
                            is_city: item.is_city,
                            is_town: item.is_town,
                            is_village: item.is_village,
                            is_hamlet: item.is_hamlet,
                            is_administrative: item.is_administrative,
                            bbox_lat_min: item.bbox_lat_min,
                            bbox_lat_max: item.bbox_lat_max,
                            bbox_lon_min: item.bbox_lon_min,
                            bbox_lon_max: item.bbox_lon_max,
                            bbox_lat_min_1000: item.bbox_lat_min_1000,
                            bbox_lat_max_1000: item.bbox_lat_max_1000,
                            bbox_lon_min_1000: item.bbox_lon_min_1000,
                            bbox_lon_max_1000: item.bbox_lon_max_1000,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;

                        if(batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert('open_cities', batch_insert);
                            batch_insert = [];
                        }
                    } else if(item.updated > db_item.updated) {
                        let update_obj = {
                            id: db_item.id,
                            country_id: country.id,
                            state_id: state?.id || null,
                            city_name: item.city_name,
                            population: item.population,
                            lat: item.lat,
                            lon: item.lon,
                            postcode: item.postcode,
                            is_city: item.is_city,
                            is_town: item.is_town,
                            is_village: item.is_village,
                            is_hamlet: item.is_hamlet,
                            is_administrative: item.is_administrative,
                            bbox_lat_min: item.bbox_lat_min,
                            bbox_lat_max: item.bbox_lat_max,
                            bbox_lon_min: item.bbox_lon_min,
                            bbox_lon_max: item.bbox_lon_max,
                            bbox_lat_min_1000: item.bbox_lat_min_1000,
                            bbox_lat_max_1000: item.bbox_lat_max_1000,
                            bbox_lon_min_1000: item.bbox_lon_min_1000,
                            bbox_lon_max_1000: item.bbox_lon_max_1000,
                            updated: timeNow()
                        };

                        batch_update.push(update_obj);
                        updated++;

                        if(batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate('open_cities', batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process any remaining batch items
                if(batch_insert.length) {
                    await dbService.batchInsert('open_cities', batch_insert);
                    batch_insert = [];
                }

                if(batch_update.length) {
                    await dbService.batchUpdate('open_cities', batch_update);
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
                        sync_process: sync_name,
                        last_updated: timeNow(),
                        created: timeNow(),
                        updated: timeNow()
                    });
            }

            console.log({
                added, updated
            });
        } catch(e) {
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

            await syncCountries();
            await syncStates();
            // await syncCities();

            console.log('Locations sync completed');

        } catch(e) {
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