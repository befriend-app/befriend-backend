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
const { filter } = require('lodash');

let batch_process = 1000;
let defaultTimeout = 20000;

let filterMapLookup = {};

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

function processFilters(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons?.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let schemaItemsLookup = {};
            let duplicateTracker = {};
            let lookup_pipelines = {};
            let lookup_db = {};

            let filtersLookup = await getFilters();

            for(let person of persons) {
                for(let section in person.filters) {
                    let filterMapping = getMappingInfo(section);

                    if(!(schemaItemsLookup[section])) {
                        schemaItemsLookup[section] = {
                            byId: {},
                            byToken: {}
                        };

                        duplicateTracker[section] = {};

                        if(filterMapping.cache) {
                            lookup_pipelines[section] = cacheService.startPipeline();
                        } else {
                            lookup_db[section] = {};
                        }
                    }

                    let items = person.filters[section].items || {};

                    for(let token in items) {
                        let item = items[token];

                        if(token in duplicateTracker[section]) {
                            continue;
                        }

                        duplicateTracker[section][token] = true;

                        if(filterMapping.cache) {
                            if(filterMapping.cache.type === 'hash') {
                                lookup_pipelines[section].hGet(filterMapping.cache.key, item.token);
                            } else if(filterMapping.cache.type === 'hash_token') {
                                lookup_pipelines[section].hGet(filterMapping.cache.key(item.hash_token), item.token);
                            }
                        } else {
                            lookup_db[section][token] = true;
                        }
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

            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            for (let batch of batches) {
                let batch_insert = {
                    persons_filters: [],
                    persons_availability: [],
                    persons_filters_networks: []
                };

                let batch_update = {
                    persons_filters: [],
                    persons_availability: [],
                    persons_filters_networks: []
                };

                const batchPersonTokens = batch.map(p => p.person_token);

                const existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated');

                let personsIdTokenMap = {};
                let personsLookup = {};

                for (const person of existingPersons) {
                    personsLookup[person.person_token] = person;
                    personsIdTokenMap[person.id] = person.person_token;
                }

                const existingPersonIds = existingPersons.map(p => p.id);

                // Get existing filters for all tables
                let existingData = {};
                let existingDataLookup = {};

                for(let table in batch_insert) {
                    existingData[table] = await conn(table)
                        .whereIn('person_id', existingPersonIds)
                        .select('*');
                }

                //filters
                existingDataLookup.filters = {};

                let filters_rows = existingData.persons_filters;

                for(let item of filters_rows) {
                    let person_token = personsIdTokenMap[item.person_id];

                    if(!person_token) {
                        console.warn("No person token");
                        continue;
                    }

                    let person_ref, filter_ref;

                    person_ref = existingDataLookup.filters[person_token];

                    if(!person_ref) {
                        person_ref = existingDataLookup.filters[person_token] = {};
                    }

                    let filter = filtersLookup.byId[item.filter_id];

                    filter_ref = person_ref[filter.token];

                    if(!filter_ref) {
                        filter_ref = person_ref[filter.token] = {
                            items: {}
                        };
                    }

                    let filterMapping = getMappingInfo(item);

                    if(filterMapping) {
                        console.log();
                    } else {
                        filter_ref.is_active = item.is_active;
                        filter_ref.is_send = item.is_send;
                        filter_ref.is_receive = item.is_receive;
                        filter_ref.updated = item.updated;
                        filter_ref.deleted = item.deleted;
                    }
                }

                //availability

                //networks

                let persons_cache = {};

                // Process each person
                for (let person of batch) {
                    let person_token = person.person_token;
                    let existingPerson = personsLookup[person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    let person_cache = persons_cache[person.person_token] = {};

                    if (person.filters) {
                        for (let [filterKey, filterData] of Object.entries(person.filters)) {
                            if (!filterData) {
                                continue;
                            }

                            let filter = filtersLookup.byToken[filterKey];
                            let filterMapping = filterMappings[filterKey];

                            if (!filter || !filterMapping) {
                                continue;
                            }

                            let existingItem = existingDataLookup.filters[person_token]?.[filterKey];

                            // Initialize cache for this filter
                            let parentEntry = {
                                person_id: existingPerson.id,
                                filter_id: filter.id,
                                is_send: filterData.is_send,
                                is_receive: filterData.is_receive,
                                is_active: filterData.is_active,
                                updated: filterData.updated,
                                deleted: filterData.deleted,
                            };

                            person_cache[filterKey] = {
                                is_send: filterData.is_send,
                                is_receive: filterData.is_receive,
                                is_active: filterData.is_active,
                                updated: filterData.updated,
                                deleted: filterData.deleted,
                                items: {}
                            };

                            if(!filterData.updated) {
                                debugger;
                            }

                            if (existingItem) {
                                if (filterData.updated > existingItem.updated) {
                                    parentEntry.id = existingItem.id;
                                    batch_update.persons_filters.push(parentEntry);
                                }
                            } else {
                                parentEntry.created = timeNow();
                                batch_insert.persons_filters.push(parentEntry);
                            }

                            if (filterKey === 'availability') {
                                // continue;
                                // processAvailabilityFilter(
                                //     person,
                                //     existingPerson,
                                //     filterData,
                                //     batch_insert.persons_availability,
                                //     batch_update.persons_availability,
                                //     person_cache[filterKey]
                                // );
                                // continue;
                            }

                            if (filterKey === 'networks') {
                                // continue;
                                // processNetworksFilter(
                                //     person,
                                //     existingPerson,
                                //     filterData,
                                //     batch_insert.persons_filters_networks,
                                //     batch_update.persons_filters_networks,
                                //     person_cache[filterKey]
                                // );
                                // continue;
                            }

                            if (filterData.items) {
                                for (let [itemToken, item] of Object.entries(filterData.items)) {
                                    let db_item = schemaItemsLookup[filterKey].byToken[itemToken];

                                    if(!db_item) {
                                        console.warn("No section item");
                                        continue;
                                    }

                                    let existingItem = existingDataLookup.filters[person_token]?.items?.[itemToken];

                                    let filterEntry = {
                                        [filterMapping.column]: db_item.id,
                                        person_id: existingPerson.id,
                                        filter_id: filter.id,
                                        is_active: item.is_active,
                                        is_send: item.is_send,
                                        is_receive: item.is_receive,
                                        is_negative: item.is_negative || false,
                                        updated: timeNow(),
                                        deleted: item.deleted || null
                                    };

                                    if (item.filter_value !== undefined) {
                                        filterEntry.filter_value = item.filter_value;
                                    }
                                    if (item.filter_value_min !== undefined) {
                                        filterEntry.filter_value_min = item.filter_value_min;
                                    }
                                    if (item.filter_value_max !== undefined) {
                                        filterEntry.filter_value_max = item.filter_value_max;
                                    }
                                    if (item.importance !== undefined) {
                                        filterEntry.importance = item.importance;
                                    }
                                    if (item.secondary_level !== undefined) {
                                        filterEntry.secondary_level = JSON.stringify(item.secondary_level);
                                    }

                                    if (existingItem) {
                                        if (item.updated > existingItem.updated) {
                                            filterEntry.id = existingItem.id;
                                            batch_update.persons_filters.push(filterEntry);
                                        }
                                    } else {
                                        filterEntry.created = timeNow();
                                        batch_insert.persons_filters.push(filterEntry);
                                    }

                                    person_cache[filterKey].items[itemToken] = {
                                        ...filterEntry,
                                        token: itemToken
                                    };
                                }
                            }
                        }
                    }
                }

                // Perform batch operations
                for (const [table, items] of Object.entries(batch_insert)) {
                    if (items.length) {
                        await batchInsert(table, items, true);
                    }
                }

                for (const [table, items] of Object.entries(batch_update)) {
                    if (items.length) {
                        await batchUpdate(table, items);
                    }
                }

                // Update cache
                let pipeline = cacheService.startPipeline();

                for (let person_token in persons_cache) {
                    let filters = persons_cache[person_token];

                    for (let filter_key in filters) {
                        let cache_key = cacheService.keys.person_filters(person_token);
                        pipeline.hSet(
                            cache_key,
                            filter_key,
                            JSON.stringify(filters[filter_key])
                        );
                    }
                }

                await cacheService.execPipeline(pipeline);
            }
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
                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if (sync_qry) {
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

                    await processFilters(network.id, response.data.persons);

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

                            await processFilters(network.id, response.data.persons);
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    if (!skipSaveTimestamps) {
                        // Update sync table
                        //todo
                        if (sync_qry) {
                            // await conn('sync').where('id', sync_qry.id).update({
                            //     last_updated: timestamps.current,
                            //     updated: timeNow(),
                            // });
                        } else {
                            // await conn('sync').insert({
                            //     network_id: network.id,
                            //     sync_process: sync_name,
                            //     last_updated: timestamps.current,
                            //     created: timeNow(),
                            //     updated: timeNow(),
                            // });
                        }
                    }
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