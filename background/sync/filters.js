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

function processMain(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            let batch_insert = [];
            let batch_update = [];

            let conn = await dbService.conn();

            let schemaItemsLookup = {};
            let duplicateTracker = {};
            let lookup_pipelines = {};
            let lookup_db = {};

            let filtersLookup = await getFilters();

            for(let person_token in persons) {
                let person = persons[person_token];

                for(let token in person) {
                    let item = person[token];
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

            const existingPersonIds = existingPersons.map(p => p.id);

            let existingData = await conn('persons_filters')
                .whereIn('person_id', existingPersonIds)
                .select('*');

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

            // Process each person
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
                        is_send: item.is_send,
                        is_receive: item.is_receive,
                        is_active: item.is_active,
                        is_negative: item.is_negative || false,
                        updated: item.updated,
                        deleted: item.deleted
                    };

                    if (item_id) {
                        entry[column_name] = item_id;
                    }

                    if (item.filter_value !== undefined) {
                        entry.filter_value = item.filter_value;
                    }

                    if (item.filter_value_min !== undefined) {
                        entry.filter_value_min = item.filter_value_min;
                    }

                    if (item.filter_value_max !== undefined) {
                        entry.filter_value_max = item.filter_value_max;
                    }

                    if (item.importance !== undefined) {
                        entry.importance = item.importance;
                    }

                    if (item.secondary_level !== undefined) {
                        entry.secondary_level = item.secondary_level || null;
                    }

                    if (item.hash_token !== undefined) {
                        entry.hash_token = item.hash_token;
                    }

                    if (existingItem) {
                        if (item.updated > existingItem.updated) {
                            entry.id = existingItem.id;
                            batch_update.push(entry);
                        }
                    } else {
                        entry.created = timeNow();
                        batch_insert.push(entry);
                    }
                }
            }

            if(batch_insert.length) {
                await batchInsert('persons_filters', batch_insert, true);
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

function processFilters(persons_filters) {
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
            
            await processMain(persons_filters.filters);

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

                    await processFilters(response.data.filters);

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

                            await processFilters(response.data.filters);
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