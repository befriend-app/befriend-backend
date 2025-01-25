const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const { getNetworkSelf } = require('../../services/network');
const { keys: systemKeys } = require('../../services/system');
const { batchInsert, batchUpdate } = require('../../services/db');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
} = require('../../services/shared');
const { getFilters, filterMappings } = require('../../services/filters');

let batch_process = 1000;
let defaultTimeout = 20000;

let filterMapLookup = {};

let debug_sync_enabled = require('../../dev/debug').sync.filters;

function getMappingInfo(filter_token) {
    if(filter_token in filterMapLookup) {
        return filterMapLookup[filter_token];
    }

    for(let k in filterMappings) {
        let filterMapping = filterMappings[k];

        if(filterMapping.token === filter_token) {
            return filterMapping;
        }
    }

    return null;
}

function getFilterMapByToken(filter_token) {
    for(let f in filterMappings) {
        if(filter_token === filterMappings[f].token) {
            return filterMappings[f];
        }
    }
}

function getFilterMapByItem(item) {
    for(let k in item) {
        if(['person_id', 'filter_id'].includes(k)) {
            continue;
        }

        let v = item[k];

        if(k.endsWith('_id') && v) {
            for(let f in filterMappings) {
                if(k === filterMappings[f].column) {
                    return filterMappings[f];
                }
            }
        }
    }

    return null;
}

function processMain(persons, updated_persons_filters) {
    return new Promise(async (resolve, reject) => {
        try {
            let batch_insert = [];
            let batch_update = [];

            let conn = await dbService.conn();
            let schema = await dbService.getSchema('persons_filters');

            let processTokens = {};
            let schemaItemsLookup = {};
            let duplicateTracker = {};
            let lookup_pipelines = {};
            let lookup_db = {};

            let filtersLookup = await getFilters();

            for(let person_token in persons) {
                let person = persons[person_token];

                for(let token in person) {
                    let item = person[token];

                    if(!item.token) {
                        continue;
                    }

                    processTokens[item.token] = true;

                    let item_token = item.item_token;

                    let filterMapping = getMappingInfo(item.filter_token);

                    if(!filterMapping) {
                        console.warn("Filter not found");
                        continue;
                    }

                    if(!(schemaItemsLookup[item.filter_token])) {
                        schemaItemsLookup[item.filter_token] = {
                            byId: {},
                            byToken: {}
                        };

                        duplicateTracker[item.filter_token] = {};

                        if(filterMapping.cache) {
                            lookup_pipelines[item.filter_token] = cacheService.startPipeline();
                        } else {
                            lookup_db[item.filter_token] = {};
                        }
                    }

                    if(!item_token) {
                        continue;
                    }

                    if(item_token in duplicateTracker[item.filter_token]) {
                        continue;
                    }

                    duplicateTracker[item.filter_token][item_token] = true;

                    //split data lookup between cache/db for large/small data sets
                    if(filterMapping.cache) {
                        if(filterMapping.cache.type === 'hash') {
                            lookup_pipelines[item.filter_token].hGet(filterMapping.cache.key, item_token);
                        } else if(filterMapping.cache.type === 'hash_token') {
                            lookup_pipelines[item.filter_token].hGet(filterMapping.cache.key(item.hash_token), item_token);
                        }
                    } else {
                        lookup_db[item.filter_token][item_token] = true;
                    }
                }
            }

            for(let section in lookup_pipelines) {
                try {
                    let results = await cacheService.execPipeline(lookup_pipelines[section]);

                    for(let result of results) {
                        result = JSON.parse(result);
                        schemaItemsLookup[section].byId[result.id] = result;
                        schemaItemsLookup[section].byToken[result.token] = result;
                    }
                } catch(e) {
                    console.error(e);
                }
            }

            //get remaining lookup data
            for(let filter in lookup_db) {
                let tokens = Object.keys(lookup_db[filter]);
                let filterMapping = getMappingInfo(filter);

                if(!tokens.length || !filterMapping?.table) {
                    continue;
                }

                let col_token = filterMapping.column_token || 'token';

                let options = await conn(filterMapping.table)
                    .whereIn(`${col_token}`, tokens)
                    .select('*', `${col_token} AS token`)

                for(let option of options) {
                    schemaItemsLookup[filter].byId[option.id] = option;
                    schemaItemsLookup[filter].byToken[option.token] = option;
                }
            }

            let existingData = await conn('persons_filters')
                .whereIn('token', Object.keys(processTokens))
                .select('*');

            //organize persons lookup
            let batchPersonTokens = Object.keys(persons);

            let existingPersons = await conn('persons')
                .whereIn('person_token', batchPersonTokens)
                .select('id', 'person_token', 'updated');

            let personsIdTokenMap = {};
            let personsLookup = {};

            for (let person of existingPersons) {
                personsLookup[person.person_token] = person;
                personsIdTokenMap[person.id] = person.person_token;
            }

            let existingDataLookup = {};

            for(let item of existingData) {
                let person_token = personsIdTokenMap[item.person_id];

                if(!person_token) {
                    console.warn("No person token");
                    continue;
                }

                if(!existingDataLookup[person_token]) {
                    existingDataLookup[person_token] = {};
                }

                existingDataLookup[person_token][item.token] = item;
            }

            for (let person_token in persons) {
                let filters = persons[person_token];
                let existingPerson = personsLookup[person_token];

                if (!existingPerson) {
                    continue;
                }

                for(let token in filters) {
                    let item = filters[token];

                    let filter = filtersLookup.byToken[item.filter_token];
                    let filterMapping = getFilterMapByToken(item.filter_token);

                    if (!filter || !filterMapping) {
                        continue;
                    }

                    let column_name = filterMapping.column;
                    let item_id = null;

                    if (item.item_token) {
                        let lookupTable = schemaItemsLookup[item.filter_token];

                        if (!lookupTable || !lookupTable.byToken[item.item_token]) {
                            console.warn("No schema item found for token:", item.item_token);
                            continue;
                        }

                        item_id = lookupTable.byToken[item.item_token].id;
                    }

                    let existingItem = existingDataLookup[person_token]?.[item.token];

                    let entry = {
                        token: item.token,
                        person_id: existingPerson.id,
                        filter_id: filter.id,
                        is_parent: item.is_parent,
                        is_send: item.is_send,
                        is_receive: item.is_receive,
                        is_active: item.is_active,
                        is_negative: item.is_negative || false,
                        is_any: item.is_any || false,
                        filter_value: typeof item.filter_value !== 'undefined' ? item.filter_value : null,
                        filter_value_min: typeof item.filter_value_min !== 'undefined' ? item.filter_value_min : null,
                        filter_value_max: typeof item.filter_value_max !== 'undefined' ? item.filter_value_max : null,
                        importance: typeof item.importance !== 'undefined' ? item.importance : null,
                        secondary_level: typeof item.secondary_level !== 'undefined' ? item.secondary_level : null,
                        hash_token: typeof item.hash_token !== 'undefined' ? item.hash_token : null,
                        updated: item.updated,
                        deleted: item.deleted || null
                    };

                    if (item_id) {
                        entry[column_name] = item_id;
                    }

                    if (existingItem) {
                        if (item.updated > existingItem.updated) {
                            //include all cols on table for batch update
                            for(let col in schema) {
                                if(['created'].includes(col)) {
                                    continue;
                                }

                                if(!(col in entry)) {
                                    entry[col] = schema[col].defaultValue;
                                }
                            }

                            entry.id = existingItem.id;
                            batch_update.push(entry);

                            existingDataLookup[person_token][item.token] = entry;

                            if(!(person_token in updated_persons_filters)) {
                                updated_persons_filters[person_token] = {
                                    person_id: entry.person_id,
                                    filters: {}
                                };
                            }

                            updated_persons_filters[person_token].filters[filterMapping.token] = true;
                        }
                    } else {
                        entry.created = timeNow();
                        batch_insert.push(entry);

                        if(!(person_token in updated_persons_filters)) {
                            updated_persons_filters[person_token] = {
                                person_id: entry.person_id,
                                filters: {}
                            };
                        }

                        updated_persons_filters[person_token].filters[filterMapping.token] = true;
                    }
                }
            }

            if(batch_insert.length) {
                await batchInsert('persons_filters', batch_insert, true);

                for(let item of batch_insert) {
                    let person_token = personsIdTokenMap[item.person_id];

                    if(!existingDataLookup[person_token]) {
                        existingDataLookup[person_token] = {};
                    }

                    existingDataLookup[person_token][item.token] = item;
                }
            }

            if(batch_update.length) {
                await batchUpdate('persons_filters', batch_update);
            }
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function processAvailability() {
    return new Promise(async (resolve, reject) => {
                
    });
}

function processNetworks() {
    return new Promise(async (resolve, reject) => {
                
    });
}

function getSiblingTokens(token) {
    let filterMap = getFilterMapByToken(token);

    let parentToken = filterMap.parent_cache || filterMap.token;

    let tokens = [];

    for(let key in filterMappings) {
        let map = filterMappings[key];

        if(map.parent_cache === parentToken || map.token === parentToken) {
            if(map.token !== token) {
                tokens.push(map.token);
            }
        }
    }

    return tokens;
}

function updateCacheMain(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            if(!Object.keys(persons).length) {
                return resolve();
            }

            let conn = await dbService.conn();
            let filtersLookup = await getFilters();

            // organize cache
            let persons_ids = {};
            let personsIdTokenMap = {};

            for(let person_token in persons) {
                let p = persons[person_token];

                persons_ids[p.person_id] = true;
                personsIdTokenMap[p.person_id] = person_token;
            }

            let filters_data = await conn('persons_filters')
                .whereIn('person_id', Object.keys(persons_ids));

            let organized_filters = {};
            let organized_update = {};

            for(let row of filters_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if(!organized_filters[person_token]) {
                    organized_filters[person_token] = {};
                }

                let filter = filtersLookup.byId[row.filter_id];

                let filterMap = getFilterMapByToken(filter.token);

                if(!filterMap) {
                    console.warn("Missing filter map");
                    continue;
                }

                if(!organized_filters[person_token][filter.token]) {
                    organized_filters[person_token][filter.token] = {};
                }

                organized_filters[person_token][filter.token][row.token] = row;
            }

            for(let person_token in persons) {
                let person = persons[person_token];

                organized_update[person_token] = {};

                for(let filter_token in person.filters) {
                    //merge data from related tokens (i.e. movies and movie genres)
                    let sibling_tokens = getSiblingTokens(filter_token);

                    if(organized_filters[person_token]?.[filter_token]) {
                        organized_update[person_token][filter_token] = organized_filters[person_token][filter_token];
                    } else {
                        console.warn("Person filter missing in existing data");
                    }

                    for(let sibling_token of sibling_tokens) {
                        if(organized_filters[person_token]?.[sibling_token]) {
                            if(!organized_update[person_token][sibling_token]) {
                                organized_update[person_token][sibling_token] = organized_filters[person_token][sibling_token];
                            }
                        }
                    }
                }
            }

            //get lookup data for all needed items
            let itemsLookup = {};
            let dbLookup = {};

            for(let person_token in organized_update) {
                let filters = organized_update[person_token];

                for(let filter_token in filters) {
                    let rows = filters[filter_token];

                    for(let token in rows) {
                        let item = rows[token];

                        let filterMapping = getMappingInfo(filter_token);

                        if(!filterMapping) {
                            console.warn("Filter not found");
                            continue;
                        }

                        let item_id = item[filterMapping.column];

                        if(!item_id) {
                            continue;
                        }

                        if(!(itemsLookup[filter_token])) {
                            itemsLookup[filter_token] = {
                                byId: {},
                                byToken: {}
                            };

                            dbLookup[filter_token] = {};
                        }

                        dbLookup[filter_token][item_id] = true;
                    }
                }
            }

            for(let filter_token in dbLookup) {
                let filterMapping = getMappingInfo(filter_token);

                if(filterMapping.table) {
                    try {
                        let cols = ['id'];

                        if(filterMapping.column_token) {
                            cols.push(`${filterMapping.column_token} AS token`);
                        } else {
                            cols.push('token');
                        }

                        if(filterMapping.column_name) {
                            cols.push(`${filterMapping.column_name} AS name`);
                        } else {
                            cols.push('name');
                        }

                        let data = await conn(filterMapping.table)
                            .whereIn('id', Object.keys(dbLookup[filter_token]))
                            .select(cols);

                        for(let item of data) {
                            itemsLookup[filter_token].byId[item.id] = item;
                            itemsLookup[filter_token].byToken[item.token] = item;
                        }
                    } catch(e) {
                        console.error(e);
                    }
                }
            }

            let persons_cache = {};
            let persons_parent_tracker = {};

            // 1st loop - parent
            for(let person_token in organized_update) {
                if(!persons_cache[person_token]) {
                    persons_cache[person_token] = {};
                }

                if(!persons_parent_tracker[person_token]) {
                    persons_parent_tracker[person_token] = {};
                }

                let filters = organized_update[person_token];

                for(let filter_token in filters) {
                    let rows = filters[filter_token];

                    for(let token in rows) {
                        let item = rows[token];

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);
                        let filter_key = filterInfo?.parent_cache || filter.token;

                        if(item.is_parent) {
                            persons_parent_tracker[person_token][filter_key] = true;

                            persons_cache[person_token][filter_key] = {
                                id: item.id,
                                is_active: item.is_active ? 1 : 0,
                                is_any: item.is_any ? 1 : 0,
                                is_send: item.is_send ? 1 : 0,
                                is_receive: item.is_receive ? 1 : 0,
                                filter_value: item.filter_value,
                                filter_value_min: item.filter_value_min,
                                filter_value_max: item.filter_value_max,
                                updated: item.updated,
                                items: {}
                            };
                        }
                    }
                }
            }

            //2nd loop - parent check
            for(let person_token in organized_update) {
                let filters = organized_update[person_token];

                for(let filter_token in filters) {
                    let rows = filters[filter_token];

                    for(let token in rows) {
                        let item = rows[token];

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);

                        let filter_key = filterInfo?.parent_cache || filter.token;

                        //missing parent setup
                        if(!persons_parent_tracker[person_token]?.[filter_key]) {
                            persons_cache[person_token][filter_key] = {
                                id: item.id,
                                is_active: 1,
                                is_send: 1,
                                is_receive: 1,
                                updated: item.updated,
                                items: {}
                            };
                        }
                    }
                }
            }

            //3rd loop - items
            for(let person_token in organized_update) {
                let filters = organized_update[person_token];

                for(let filter_token in filters) {
                    let rows = filters[filter_token];

                    for(let token in rows) {
                        let item = rows[token];

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);

                        let filter_key = filterInfo?.parent_cache || filter.token;

                        if(!item.is_parent) {
                            let items = persons_cache[person_token][filter_key].items;

                            let item_extra = {};

                            let filter_map = getFilterMapByItem(item);

                            if(filter_map) {
                                let item_data;

                                try {
                                    item_data = itemsLookup[filter_map.token].byId[item[filter_map.column]];
                                } catch(e) {
                                    console.error(e);
                                    continue;
                                }

                                if(item_data) {
                                    item_extra = {
                                        token: item_data.token,
                                        name: item_data.name
                                    }

                                    if(filter_map.table_key) {
                                        item_extra.table_key = filter_map.table_key;
                                    }
                                }
                            }

                            items[item.id] = {
                                is_active: item.is_active ? 1 : 0,
                                is_negative: item.is_negative ? 1 : 0,
                                importance: item.importance,
                                secondary: item.secondary_level ? JSON.parse(item.secondary_level) : null,
                                updated: item.updated,
                                deleted: item.deleted,
                                ...item_extra
                            }
                        }
                    }
                }
            }

            let pipeline = cacheService.startPipeline();

            for(let person_token in persons_cache) {
                let person = persons_cache[person_token];

                for(let filter_name in person) {
                    let filter = person[filter_name];
                    pipeline.hSet(cacheService.keys.person_filters(person_token), filter_name, JSON.stringify(filter));
                }
            }

            try {
                await cacheService.execPipeline(pipeline);
            } catch(e) {
                console.error(e);
            }
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function processFilters(persons_filters, updated_persons_filters) {
    return new Promise(async (resolve, reject) => {
        try {
            let hasPersons = false;

            for(let k in persons_filters) {
                let persons = persons_filters[k];

                if(Object.keys(persons).length) {
                    hasPersons = true;
                }
            }

            if(!hasPersons) {
                return resolve();
            }
            
            await processMain(persons_filters.filters, updated_persons_filters);

            // await processAvailability(persons_filters.availability);
            //
            // await processNetworks(persons_filters.networks);
        } catch (e) {
            console.error('Error in processFilters:', e);
            return reject(e);
        }

        resolve();
    });
}

function processAvailabilityFilter(person, existingPerson, filterData, batchInsert, batchUpdate, cacheData) {
    const now = timeNow();

    if (filterData.items) {
        for (let [token, item] of Object.entries(filterData.items)) {
            const availabilityEntry = {
                person_id: existingPerson.id,
                token: token,
                day_of_week: item.day_of_week,
                is_day: item.is_day,
                is_time: item.is_time,
                start_time: item.start_time,
                end_time: item.end_time,
                is_overnight: item.is_overnight,
                is_any_time: item.is_any_time,
                is_active: item.is_active,
                updated: now,
                deleted: item.deleted || null
            };

            if (item.id) {
                availabilityEntry.id = item.id;
                batchUpdate.push(availabilityEntry);
            } else {
                availabilityEntry.created = now;
                batchInsert.push(availabilityEntry);
            }

            cacheData.items[token] = availabilityEntry;
        }
    }
}

function processNetworksFilter(person, existingPerson, filterData, batchInsert, batchUpdate, cacheData) {
    const now = timeNow();

    // Process base network filter settings
    cacheData.is_all_verified = filterData.is_all_verified;
    cacheData.is_any_network = filterData.is_any_network;

    if (filterData.items) {
        for (let [networkToken, item] of Object.entries(filterData.items)) {
            const networkEntry = {
                person_id: existingPerson.id,
                network_token: networkToken,
                is_active: item.is_active,
                updated: now,
                deleted: item.deleted || null,
                is_all_verified: filterData.is_all_verified,
                is_any_network: filterData.is_any_network
            };

            if (item.id) {
                networkEntry.id = item.id;
                batchUpdate.push(networkEntry);
            } else {
                networkEntry.created = now;
                batchInsert.push(networkEntry);
            }

            cacheData.items[networkToken] = networkEntry;
        }
    }
}

function syncFilters() {
    console.log("Sync: filters");

    let sync_name = systemKeys.sync.network.persons_filters;

    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch(e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject(e);
        }

        try {
            conn = await dbService.conn();

            networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);
        } catch (e) {
            console.error(e);
        }

        if (networks) {
            for (let network of networks) {
                try {
                    let t = timeNow();

                    let updated_persons_filters = {};

                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if (sync_qry && !debug_sync_enabled) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons/filters'));

                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_to_qry) {
                        continue;
                    }

                    const axiosInstance = axios.create({
                        timeout: defaultTimeout
                    });

                    let response = await axiosInstance.get(sync_url, {
                        params: {
                            secret_key: secret_key_to_qry.secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow(),
                        }
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processFilters(response.data.filters, updated_persons_filters);

                    while (response.data.pagination_updated) {
                        try {
                            response = await axiosInstance.get(sync_url, {
                                params: {
                                    secret_key: secret_key_to_qry.secret_key_to,
                                    network_token: network_self.network_token,
                                    pagination_updated: response.data.pagination_updated,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow(),
                                }
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            await processFilters(response.data.filters, updated_persons_filters);
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    //update cache once all data is processed for network
                    await updateCacheMain(updated_persons_filters);

                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        // Update sync table
                        if (sync_qry) {
                            await conn('sync').where('id', sync_qry.id)
                                .update({
                                    last_updated: timestamps.current,
                                    updated: timeNow(),
                                });
                        } else {
                            await conn('sync')
                                .insert({
                                    network_id: network.id,
                                    sync_process: sync_name,
                                    last_updated: timestamps.current,
                                    created: timeNow(),
                                    updated: timeNow(),
                                });
                        }
                    }

                    console.log({
                        process_time: timeNow() - t
                    });
                } catch (e) {
                    console.error(e);
                }
            }
        }

        resolve();
    });
}

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncFilters();
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main
}

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