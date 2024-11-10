const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');

loadScriptEnv();

const sync_name = 'sync_schools';

function syncSchools() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync schools");

        let main_table = 'schools';

        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];

        const BATCH_SIZE = 10000;

        try {
            let conn = await dbService.conn();

            // Last sync time
            let last_sync = await conn('sync')
                .where('sync_process', sync_name)
                .first();

            // Countries lookup
            let countries_dict = {};
            let countries = await conn('open_countries');

            for(let country of countries) {
                countries_dict[country.country_code] = country;
            }

            // States lookup
            let states_dict = {};
            let states = await conn('open_states');

            for(let state of states) {
                states_dict[state.token] = state;
            }

            // Cities lookup
            let cities_dict = {};
            let cities = await conn('open_cities')
                .select('id', 'city_name', 'token');

            for(let city of cities) {
                cities_dict[city.token] = city;
            }

            let schools_dict = {};
            let schools = await conn(main_table);

            for(let school of schools) {
                schools_dict[school.token] = school;
            }

            let offset = 0;
            let hasMore = true;
            let saveTimestamp = null;

            while(hasMore) {
                let endpoint = dataEndpoint(`/schools?offset=${offset}`);

                if(last_sync?.last_updated) {
                    endpoint += `&updated=${last_sync.last_updated}`;
                }

                console.log(`Fetching schools with offset ${offset}`);

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

                    let state = states_dict[item.state_token];

                    if (item.state_token && !state) {
                        console.warn(`State not found: ${item.state_token} for country ${item.country_code}`);
                        continue;
                    }

                    let city = cities_dict[item.city_token];

                    if(!city) {
                        console.warn(`City not found: ${item.city_token} for country ${item.country_code}`);
                        continue;
                    }

                    let db_item = schools_dict[item.token];

                    if(!db_item) {
                        //do not insert deleted school
                        if(item.deleted) {
                            continue;
                        }

                        let new_item = {
                            token: item.token,
                            name: item.name,
                            student_count: item.student_count,
                            lat: item.lat,
                            lon: item.lon,
                            is_grade_school: !!item.is_grade_school,
                            is_high_school: !!item.is_high_school,
                            is_college: !!item.is_college,
                            country_id: country.id,
                            state_id: state?.id || null,
                            city_id: city.id,
                            created: timeNow(),
                            updated: timeNow()
                        };

                        batch_insert.push(new_item);
                        added++;

                        if(batch_insert.length >= BATCH_SIZE) {
                            await dbService.batchInsert('schools', batch_insert);
                            batch_insert = [];
                        }
                    } else if(item.updated > db_item.updated) {
                        let update_obj = structuredClone(db_item);

                        let has_changes = false;

                        delete item.country_code;
                        delete item.state_token;
                        delete item.city_token;

                        if(country && country.id !== db_item.country_id) {
                            db_item.country = country.id;
                            has_changes = true;
                        }

                        if(state && state.id !== db_item.state_id) {
                            db_item.state_id = state.id;
                            has_changes = true;
                        }

                        if(city && city.id !== db_item.city_id) {
                            db_item.city_id = city.id;
                            has_changes = true;
                        }

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
                            updated++;
                        }

                        if(batch_update.length >= BATCH_SIZE) {
                            await dbService.batchUpdate(main_table, batch_update);
                            batch_update = [];
                        }
                    }
                }

                // Process any remaining batch items
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

            await syncSchools();

            console.log('Schools sync completed');

            await require('../index/index_schools').main();
        } catch(e) {
            console.error(e);
            return reject();
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