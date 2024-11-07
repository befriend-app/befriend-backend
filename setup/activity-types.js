const axios = require('axios');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { loadScriptEnv, dataEndpoint, timeNow } = require('../services/shared');

loadScriptEnv();

let db_dict_activities = {};
let db_dict_venues = {};

function activityTypes() {
    return new Promise(async (resolve, reject) => {
        console.log("Add activity types");

        let table_name = 'activity_types';
        let token_key = 'activity_type_token';
        let added = 0;
        let updated = 0;

        try {
             let conn = await dbService.conn();

             let previous = await conn(table_name);

             for(let item of previous) {
                 db_dict_activities[item[token_key]] = item;
             }

             let endpoint = dataEndpoint(`/activity-types`);

             let r = await axios.get(endpoint);

             let update_cache = false;

             for(let item of r.data.items) {
                 let db_item = db_dict_activities[item[token_key]];

                 if(!db_item) {
                     update_cache = true;
                     let new_item = structuredClone(item);
                     new_item.created = timeNow();
                     new_item.updated = timeNow();

                     if(item.parent_token) {
                         try {
                             new_item.parent_activity_type_id = db_dict_activities[item.parent_token].id;
                         } catch(e) {
                             console.error(e);
                         }
                     }

                     delete new_item.parent_token;

                     let [id] = await conn(table_name)
                         .insert(new_item);

                     added++;

                     new_item.id = id;

                     db_dict_activities[item[token_key]] = new_item;
                 } else {
                     if(item.updated > db_item.updated) {
                         update_cache = true;
                         delete item.parent_token;
                         delete item.updated;

                         let update_obj = {};

                         for(let k in item) {
                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                            }
                         }

                         if(Object.keys(update_obj).length) {
                             update_obj.updated = timeNow();

                             await conn(table_name)
                                 .where('id', db_item.id)
                                 .update(update_obj);

                             //remove specific activity type from cache
                             await cacheService.deleteKeys(cacheService.keys.activity_type(item[token_key]));

                             updated++;
                         }
                     }
                 }
             }

             if(update_cache) {
                 //remove previous cache
                 await cacheService.deleteKeys(cacheService.keys.activity_types);
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

function venueCategories() {
    return new Promise(async (resolve, reject) => {
        console.log('Add venue categories');

        let table_name = 'venues_categories';
        let token_key = 'category_token';

        let added = 0;
        let updated = 0;

        try {
            let conn = await dbService.conn();

            let previous = await conn(table_name);

            for(let item of previous) {
                db_dict_venues[item[token_key]] = item;
            }

            let endpoint = dataEndpoint(`/venues-categories`);

            let r = await axios.get(endpoint);

            let update_cache = false;

            for(let item of r.data.items) {
                let db_item = db_dict_venues[item[token_key]];

                if(!db_item) {
                    update_cache = true;
                    let new_item = structuredClone(item);
                    new_item.created = timeNow();
                    new_item.updated = timeNow();

                    if(item.parent_token) {
                        new_item.parent_id = db_dict_venues[item.parent_token].id;
                    }

                    delete new_item.parent_token;

                    let [id] = await conn(table_name)
                        .insert(new_item);

                    added++;

                    new_item.id = id;

                    db_dict_venues[item[token_key]] = new_item;
                } else {
                    if(item.updated > db_item.updated) {
                        update_cache = true;
                        delete item.parent_token;
                        delete item.updated;

                        let update_obj = {};

                        for(let k in item) {
                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                            }
                        }

                        if(Object.keys(update_obj).length) {
                            update_obj.updated = timeNow();

                            await conn(table_name)
                                .where('id', db_item.id)
                                .update(update_obj);

                            updated++;
                        }
                    }
                }
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

function activitiesVenues() {
    return new Promise(async (resolve, reject) => {
        console.log("Add activity-venue-categories");

        let table_name = 'activity_type_venues';
        let token_key_1 = 'activity_type_token';
        let token_key_2 = 'category_token';

        let added = 0;
        let updated = 0;

        let db_dict = {};

        try {
            let conn = await dbService.conn();

            let previous = await conn(`${table_name} AS atv`)
                .join('activity_types AS at', 'at.id', '=', 'atv.activity_type_id')
                .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
                .select('atv.id', 'activity_type_token', 'category_token', 'atv.sort_position', 'atv.is_active', 'atv.updated');

            for(let item of previous) {
                if(!(item[token_key_1] in db_dict)) {
                    db_dict[item[token_key_1]] = {};
                }

                db_dict[item[token_key_1]][item[token_key_2]] = item;
            }

            let endpoint = dataEndpoint(`/activities-venue-categories`);

            let r = await axios.get(endpoint);

            let update_cache = false;

            for(let item of r.data.items) {
                let db_item = db_dict[item[token_key_1]]?.[item[token_key_2]];

                if(!db_item) {
                    update_cache = true;
                    let new_item = structuredClone(item);

                    delete new_item[token_key_1];
                    delete new_item[token_key_2];

                    new_item.activity_type_id = db_dict_activities[item[token_key_1]].id;
                    new_item.venue_category_id = db_dict_venues[item[token_key_2]].id;
                    new_item.created = timeNow();
                    new_item.updated = timeNow();

                    let [id] = await conn(table_name)
                        .insert(new_item);

                    added++;

                    new_item.id = id;
                } else {
                    if(item.updated > db_item.updated) {
                        update_cache = true;

                        let activity_type_token = item[token_key_1];

                        delete item[token_key_1];
                        delete item[token_key_2];

                        let update_obj = {};

                        for(let k in item) {
                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                            }
                        }

                        if(Object.keys(update_obj).length) {
                            update_obj.updated = timeNow();

                            await conn(table_name)
                                .where('id', db_item.id)
                                .update(update_obj);

                            await cacheService.deleteKeys(cacheService.keys.activity_type_venue_categories(activity_type_token))

                            updated++;
                        }
                    }
                }
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

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await activityTypes();
            await venueCategories();
            await activitiesVenues();
        } catch (e) {
            console.error(e);
        }

        console.log('Activity types finished');

        resolve();
    });
}

module.exports = {
    main: main,
};

//script executed directly
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
