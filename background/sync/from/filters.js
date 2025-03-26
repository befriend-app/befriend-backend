const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');

const {
    getNetworkSelf,
    getNetworksLookup,
    getSecretKeyToForNetwork,
    getSyncNetworks,
} = require('../../../services/network');
const {
    keys: systemKeys,
    getNetworkSyncProcess,
    setNetworkSyncProcess,
} = require('../../../system');
const { batchInsert, batchUpdate } = require('../../../services/db');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
} = require('../../../services/shared');

const { getFilters, filterMappings, batchUpdateGridSets } = require('../../../services/filters');

let batch_process = 1000;
let defaultTimeout = 20000;

let filterMapLookup = {};

let debug_sync_enabled = require('../../../dev/debug').sync.filters;

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncFilters();
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function syncFilters() {
    console.log('Sync: filters');

    let sync_name = systemKeys.sync.network.persons_filters;

    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch (e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject(e);
        }

        try {
            networks = await getSyncNetworks();
        } catch (e) {
            console.error(e);
        }

        if (networks) {
            for (let network of networks) {
                try {
                    let t = timeNow();

                    let updated_persons = {
                        filters: {},
                        availability: {},
                        networks: {},
                    };

                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let sync_qry = await getNetworkSyncProcess(sync_name, network.network_id);

                    if (sync_qry && !debug_sync_enabled) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons/filters'));

                    let secret_key_to = await getSecretKeyToForNetwork(network.id);

                    if (!secret_key_to) {
                        continue;
                    }

                    const axiosInstance = axios.create({
                        timeout: defaultTimeout,
                    });

                    let response = await axiosInstance.get(sync_url, {
                        params: {
                            secret_key: secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow(),
                        },
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    let success = await processFilters(
                        network.id,
                        response.data.filters,
                        updated_persons,
                    );

                    if (!success) {
                        skipSaveTimestamps = true;
                    }

                    while (response.data.pagination_updated) {
                        try {
                            response = await axiosInstance.get(sync_url, {
                                params: {
                                    secret_key: secret_key_to,
                                    network_token: network_self.network_token,
                                    pagination_updated: response.data.pagination_updated,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow(),
                                },
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            let success = await processFilters(
                                network.id,
                                response.data.filters,
                                updated_persons,
                            );

                            if (!success) {
                                skipSaveTimestamps = true;
                            }
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    //update cache once all data is processed for network
                    await updateCacheMain(updated_persons.filters);

                    //merge availability/networks for cache
                    for (let person_token in updated_persons.filters) {
                        for (let filter of ['availability', 'networks']) {
                            if (person_token in updated_persons[filter]) {
                                continue;
                            }

                            let person = updated_persons.filters[person_token];

                            if (filter in person.filters) {
                                updated_persons[filter][person_token] = person.person_id;
                            }
                        }
                    }

                    await updateCacheAvailability(updated_persons.availability);

                    await updateCacheNetworks(updated_persons.networks);

                    await updateFilterGridSets(updated_persons.filters);

                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        let sync_update = {
                            sync_process: sync_name,
                            network_id: network.id,
                            last_updated: timestamps.current,
                            created: sync_qry ? sync_qry.created : timeNow(),
                            updated: timeNow(),
                        };

                        await setNetworkSyncProcess(sync_name, network.network_id, sync_update);
                    }

                    console.log({
                        process_time: timeNow() - t,
                    });
                } catch (e) {
                    console.error(e);
                }
            }
        }

        resolve();
    });
}

function processFilters(network_id, persons_filters, updated_persons) {
    return new Promise(async (resolve, reject) => {
        let hasPersons = false;
        let hasInvalidPersons = false;

        try {
            for (let k in persons_filters) {
                let persons = persons_filters[k];

                if (Object.keys(persons).length) {
                    hasPersons = true;
                }
            }

            if (!hasPersons) {
                return resolve(true);
            }

            //ensure this network has permission to provide updated data for these persons
            let conn = await dbService.conn();
            let batchPersonTokens = new Set();

            for (let type in persons_filters) {
                for (let person_token in persons_filters[type]) {
                    batchPersonTokens.add(person_token);
                }
            }

            let validNetworkPersons = await conn('networks_persons AS np')
                .join('persons AS p', 'p.id', '=', 'np.person_id')
                .where('network_id', network_id)
                .where('np.is_active', true)
                .whereIn('person_token', Array.from(batchPersonTokens))
                .whereNull('np.deleted')
                .select('p.person_token');

            let validPersonsLookup = {};

            for (let vnp of validNetworkPersons) {
                validPersonsLookup[vnp.person_token] = true;
            }

            let invalidPersons = {};

            for (let type in persons_filters) {
                let filteredPersons = {};

                for (let person_token in persons_filters[type]) {
                    if (person_token in validPersonsLookup) {
                        filteredPersons[person_token] = persons_filters[type][person_token];
                    } else {
                        hasInvalidPersons = true;

                        if (!invalidPersons[person_token]) {
                            invalidPersons[person_token] = [];
                        }

                        invalidPersons[person_token].push(type);
                    }
                }

                persons_filters[type] = filteredPersons;
            }

            if (Object.keys(invalidPersons).length) {
                console.warn({
                    invalid_persons_count: Object.keys(invalidPersons).length,
                });
            }

            await processMain(persons_filters.filters, updated_persons.filters);

            await processAvailability(persons_filters.availability, updated_persons.availability);

            await processNetworks(persons_filters.networks, updated_persons.networks);
        } catch (e) {
            console.error('Error in processFilters:', e);
            return reject(e);
        }

        resolve(!hasInvalidPersons);
    });
}

function processMain(persons, updated_persons_filters) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!persons || !Object.keys(persons).length) {
                return resolve();
            }

            if (persons.length > 50000) {
                console.error('Response too large, check network data');
                return resolve();
            }

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

            for (let person_token in persons) {
                let person = persons[person_token];

                for (let token in person) {
                    let item = person[token];

                    if (!item.token) {
                        continue;
                    }

                    processTokens[item.token] = true;

                    let item_token = item.item_token;

                    let filterMapping = getMappingInfo(item.filter_token);

                    if (!filterMapping) {
                        console.warn('Filter not found');
                        continue;
                    }

                    if (!schemaItemsLookup[item.filter_token]) {
                        schemaItemsLookup[item.filter_token] = {
                            byId: {},
                            byToken: {},
                        };

                        duplicateTracker[item.filter_token] = {};

                        if (filterMapping.cache) {
                            lookup_pipelines[item.filter_token] = cacheService.startPipeline();
                        } else {
                            lookup_db[item.filter_token] = {};
                        }
                    }

                    if (!item_token) {
                        continue;
                    }

                    if (item_token in duplicateTracker[item.filter_token]) {
                        continue;
                    }

                    duplicateTracker[item.filter_token][item_token] = true;

                    //split data lookup between cache/db for large/small data sets
                    if (filterMapping.cache) {
                        if (filterMapping.cache.type === 'hash') {
                            lookup_pipelines[item.filter_token].hGet(
                                filterMapping.cache.key,
                                item_token,
                            );
                        } else if (filterMapping.cache.type === 'hash_token') {
                            lookup_pipelines[item.filter_token].hGet(
                                filterMapping.cache.key(item.hash_token),
                                item_token,
                            );
                        }
                    } else {
                        lookup_db[item.filter_token][item_token] = true;
                    }
                }
            }

            for (let section in lookup_pipelines) {
                try {
                    let results = await cacheService.execPipeline(lookup_pipelines[section]);

                    for (let result of results) {
                        result = JSON.parse(result);
                        schemaItemsLookup[section].byId[result.id] = result;
                        schemaItemsLookup[section].byToken[result.token] = result;
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            //get remaining lookup data
            for (let filter in lookup_db) {
                let tokens = Object.keys(lookup_db[filter]);
                let filterMapping = getMappingInfo(filter);

                if (!tokens.length || !filterMapping?.table) {
                    continue;
                }

                let col_token = filterMapping.column_token || 'token';

                let options = await conn(filterMapping.table)
                    .whereIn(`${col_token}`, tokens)
                    .select('*', `${col_token} AS token`);

                for (let option of options) {
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

            for (let item of existingData) {
                let person_token = personsIdTokenMap[item.person_id];

                if (!person_token) {
                    console.warn('No person token');
                    continue;
                }

                if (!existingDataLookup[person_token]) {
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

                for (let token in filters) {
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
                            console.warn('No schema item found for token:', item.item_token);
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
                        filter_value:
                            typeof item.filter_value !== 'undefined' ? item.filter_value : null,
                        filter_value_min:
                            typeof item.filter_value_min !== 'undefined'
                                ? item.filter_value_min
                                : null,
                        filter_value_max:
                            typeof item.filter_value_max !== 'undefined'
                                ? item.filter_value_max
                                : null,
                        importance: typeof item.importance !== 'undefined' ? item.importance : null,
                        secondary_level:
                            typeof item.secondary_level !== 'undefined'
                                ? item.secondary_level
                                : null,
                        hash_token: typeof item.hash_token !== 'undefined' ? item.hash_token : null,
                        updated: item.updated,
                        deleted: item.deleted || null,
                    };

                    if (item_id) {
                        entry[column_name] = item_id;
                    }

                    if (existingItem) {
                        if (item.updated > existingItem.updated || debug_sync_enabled) {
                            //include all cols on table for batch update
                            for (let col in schema) {
                                if (['created'].includes(col)) {
                                    continue;
                                }

                                if (!(col in entry)) {
                                    entry[col] = schema[col].defaultValue;
                                }
                            }

                            entry.id = existingItem.id;
                            batch_update.push(entry);

                            existingDataLookup[person_token][item.token] = entry;

                            if (!(person_token in updated_persons_filters)) {
                                updated_persons_filters[person_token] = {
                                    person_id: entry.person_id,
                                    filters: {},
                                };
                            }

                            updated_persons_filters[person_token].filters[filterMapping.token] =
                                true;
                        }
                    } else {
                        entry.created = timeNow();
                        batch_insert.push(entry);

                        if (!(person_token in updated_persons_filters)) {
                            updated_persons_filters[person_token] = {
                                person_id: entry.person_id,
                                filters: {},
                            };
                        }

                        updated_persons_filters[person_token].filters[filterMapping.token] = true;
                    }
                }
            }

            if (batch_insert.length) {
                await batchInsert('persons_filters', batch_insert, true);

                for (let item of batch_insert) {
                    let person_token = personsIdTokenMap[item.person_id];

                    if (!existingDataLookup[person_token]) {
                        existingDataLookup[person_token] = {};
                    }

                    existingDataLookup[person_token][item.token] = item;
                }
            }

            if (batch_update.length) {
                await batchUpdate('persons_filters', batch_update);
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function processAvailability(persons, updated_persons_availability) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!persons || !Object.keys(persons).length) {
                return resolve();
            }

            if (persons.length > 50000) {
                console.error('Response too large, check network data');
                return resolve();
            }

            let batch_insert = [];
            let batch_update = [];

            let conn = await dbService.conn();

            let processTokens = {};

            for (let person_token in persons) {
                for (let token in persons[person_token]) {
                    processTokens[token] = true;
                }
            }

            let existingData = await conn('persons_availability')
                .whereIn('token', Object.keys(processTokens))
                .select('*');

            let batchPersonTokens = Object.keys(persons);

            let existingPersons = await conn('persons')
                .whereIn('person_token', batchPersonTokens)
                .select('id', 'person_token', 'updated');

            let personsLookup = {};
            let personsIdTokenMap = {};

            for (let person of existingPersons) {
                personsLookup[person.person_token] = person;
                personsIdTokenMap[person.id] = person.person_token;
            }

            let existingDataLookup = {};

            for (let item of existingData) {
                let person_token = personsIdTokenMap[item.person_id];

                if (!person_token) {
                    continue;
                }

                if (!existingDataLookup[person_token]) {
                    existingDataLookup[person_token] = {};
                }

                existingDataLookup[person_token][item.token] = item;
            }

            for (let person_token in persons) {
                let availabilityData = persons[person_token];
                let existingPerson = personsLookup[person_token];

                if (!existingPerson) {
                    continue;
                }

                for (let token in availabilityData) {
                    let item = availabilityData[token];
                    let existingItem = existingDataLookup[person_token]?.[item.token];

                    let entry = {
                        token: item.token,
                        person_id: existingPerson.id,
                        day_of_week: item.day_of_week,
                        is_day: item.is_day,
                        is_time: item.is_time,
                        start_time: item.start_time,
                        end_time: item.end_time,
                        is_overnight: item.is_overnight,
                        is_any_time: item.is_any_time,
                        is_active: item.is_active,
                        updated: item.updated,
                        deleted: item.deleted || null,
                    };

                    if (existingItem) {
                        if (item.updated > existingItem.updated || debug_sync_enabled) {
                            entry.id = existingItem.id;
                            batch_update.push(entry);
                            existingDataLookup[person_token][item.token] = entry;

                            updated_persons_availability[person_token] = entry.person_id;
                        }
                    } else {
                        entry.created = timeNow();
                        batch_insert.push(entry);

                        if (!existingDataLookup[person_token]) {
                            existingDataLookup[person_token] = {};
                        }

                        existingDataLookup[person_token][item.token] = entry;

                        updated_persons_availability[person_token] = entry.person_id;
                    }
                }
            }

            if (batch_insert.length) {
                await batchInsert('persons_availability', batch_insert, true);
            }

            if (batch_update.length) {
                await batchUpdate('persons_availability', batch_update);
            }
        } catch (e) {
            console.error('Error in processAvailability:', e);
            return reject(e);
        }

        resolve();
    });
}

function processNetworks(persons, updated_persons_networks) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!persons || !Object.keys(persons).length) {
                return resolve();
            }

            if (persons.length > 50000) {
                console.error('Response too large, check network data');
                return resolve();
            }

            let batch_insert = [];
            let batch_update = [];

            let networksLookup = await getNetworksLookup();
            let conn = await dbService.conn();

            let processTokens = {};

            for (let person_token in persons) {
                for (let token in persons[person_token]) {
                    processTokens[token] = true;
                }
            }

            let existingData = await conn('persons_filters_networks')
                .whereIn('token', Object.keys(processTokens))
                .select('*');

            let batchPersonTokens = Object.keys(persons);

            let existingPersons = await conn('persons')
                .whereIn('person_token', batchPersonTokens)
                .select('id', 'person_token', 'updated');

            let personsLookup = {};
            let personsIdTokenMap = {};

            for (let person of existingPersons) {
                personsLookup[person.person_token] = person;
                personsIdTokenMap[person.id] = person.person_token;
            }

            let existingDataLookup = {};

            for (let item of existingData) {
                let person_token = personsIdTokenMap[item.person_id];

                if (!person_token) {
                    continue;
                }

                if (!existingDataLookup[person_token]) {
                    existingDataLookup[person_token] = {};
                }

                existingDataLookup[person_token][item.token] = item;
            }

            for (let person_token in persons) {
                let networkData = persons[person_token];
                let existingPerson = personsLookup[person_token];

                if (!existingPerson) {
                    continue;
                }

                for (let token in networkData) {
                    let item = networkData[token];
                    let existingItem = existingDataLookup[person_token]?.[item.token];

                    let network_id = item.network_token
                        ? networksLookup.byToken[item.network_token]
                        : null;

                    let entry = {
                        token: item.token,
                        person_id: existingPerson.id,
                        network_id: network_id || null,
                        is_all_verified: item.is_all_verified || false,
                        is_any_network: item.is_any_network || false,
                        is_active: item.is_active,
                        updated: item.updated,
                        deleted: item.deleted || null,
                    };

                    if (existingItem) {
                        if (item.updated > existingItem.updated || debug_sync_enabled) {
                            entry.id = existingItem.id;
                            batch_update.push(entry);
                            existingDataLookup[person_token][item.token] = entry;

                            updated_persons_networks[person_token] = entry.person_id;
                        }
                    } else {
                        entry.created = timeNow();
                        batch_insert.push(entry);

                        if (!existingDataLookup[person_token]) {
                            existingDataLookup[person_token] = {};
                        }

                        existingDataLookup[person_token][item.token] = entry;

                        updated_persons_networks[person_token] = entry.person_id;
                    }
                }
            }

            if (batch_insert.length) {
                await batchInsert('persons_filters_networks', batch_insert, true);
            }

            if (batch_update.length) {
                await batchUpdate('persons_filters_networks', batch_update);
            }
        } catch (e) {
            console.error('Error in processNetworks:', e);
            return reject(e);
        }

        resolve();
    });
}

function updateCacheMain(persons) {
    function getParentItem(person, parent_key) {
        let section = person[parent_key];

        if (!section) {
            return null;
        }

        for (let k in section) {
            let item = section[k];

            if (item.is_parent) {
                return item;
            }
        }

        return null;
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!Object.keys(persons).length) {
                return resolve();
            }

            console.log('Update cache: filters');

            let conn = await dbService.conn();

            let filtersLookup = await getFilters();

            // organize cache
            let persons_ids = {};
            let personsIdTokenMap = {};

            for (let person_token in persons) {
                let p = persons[person_token];

                persons_ids[p.person_id] = true;
                personsIdTokenMap[p.person_id] = person_token;
            }

            let filters_data = await conn('persons_filters').whereIn(
                'person_id',
                Object.keys(persons_ids),
            );

            let organized_filters = {};
            let organized_update = {};

            for (let row of filters_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if (!organized_filters[person_token]) {
                    organized_filters[person_token] = {};
                }

                let filter = filtersLookup.byId[row.filter_id];

                let filterMap = getFilterMapByToken(filter.token);

                if (!filterMap) {
                    console.warn('Missing filter map');
                    continue;
                }

                if (!organized_filters[person_token][filter.token]) {
                    organized_filters[person_token][filter.token] = {};
                }

                organized_filters[person_token][filter.token][row.token] = row;
            }

            for (let person_token in persons) {
                let person = persons[person_token];

                organized_update[person_token] = {};

                for (let filter_token in person.filters) {
                    //merge data from related tokens (i.e. movies and movie genres)
                    let sibling_tokens = getSiblingTokens(filter_token);

                    if (organized_filters[person_token]?.[filter_token]) {
                        organized_update[person_token][filter_token] =
                            organized_filters[person_token][filter_token];
                    } else {
                        console.warn('Person filter missing in existing data');
                    }

                    for (let sibling_token of sibling_tokens) {
                        if (organized_filters[person_token]?.[sibling_token]) {
                            if (!organized_update[person_token][sibling_token]) {
                                organized_update[person_token][sibling_token] =
                                    organized_filters[person_token][sibling_token];
                            }
                        }
                    }
                }
            }

            //get lookup data for all needed items
            let itemsLookup = {};
            let dbLookup = {};

            for (let person_token in organized_update) {
                let filters = organized_update[person_token];

                for (let filter_token in filters) {
                    let rows = filters[filter_token];

                    for (let token in rows) {
                        let item = rows[token];

                        let filterMapping = getMappingInfo(filter_token);

                        if (!filterMapping) {
                            console.warn('Filter not found');
                            continue;
                        }

                        let item_id = item[filterMapping.column];

                        if (!item_id) {
                            continue;
                        }

                        if (!itemsLookup[filter_token]) {
                            itemsLookup[filter_token] = {
                                byId: {},
                                byToken: {},
                            };

                            dbLookup[filter_token] = {};
                        }

                        dbLookup[filter_token][item_id] = true;
                    }
                }
            }

            for (let filter_token in dbLookup) {
                let filterMapping = getMappingInfo(filter_token);

                if (filterMapping.table) {
                    try {
                        let cols = ['id'];

                        if (filterMapping.column_token) {
                            cols.push(`${filterMapping.column_token} AS token`);
                        } else {
                            cols.push('token');
                        }

                        if (filterMapping.column_name) {
                            cols.push(`${filterMapping.column_name} AS name`);
                        } else {
                            cols.push('name');
                        }

                        let data = await conn(filterMapping.table)
                            .whereIn('id', Object.keys(dbLookup[filter_token]))
                            .select(cols);

                        for (let item of data) {
                            itemsLookup[filter_token].byId[item.id] = item;
                            itemsLookup[filter_token].byToken[item.token] = item;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            let persons_cache = {};
            let persons_parent_tracker = {};

            // 1st loop - parent
            for (let person_token in organized_update) {
                if (!persons_cache[person_token]) {
                    persons_cache[person_token] = {};
                }

                if (!persons_parent_tracker[person_token]) {
                    persons_parent_tracker[person_token] = {};
                }

                let filters = organized_update[person_token];

                for (let filter_token in filters) {
                    let rows = filters[filter_token];

                    for (let token in rows) {
                        let item = rows[token];
                        let parent_item = item;

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);
                        let filter_key = filterInfo?.parent_cache || filter.token;

                        if (filterInfo?.parent_cache && filterInfo.parent_cache !== filter.token) {
                            parent_item = getParentItem(
                                organized_update[person_token],
                                filterInfo.parent_cache,
                            );
                        }

                        if (parent_item.is_parent) {
                            persons_parent_tracker[person_token][filter_key] = true;

                            persons_cache[person_token][filter_key] = {
                                id: parent_item.id,
                                is_active: parent_item.is_active ? 1 : 0,
                                is_any: parent_item.is_any ? 1 : 0,
                                is_send: parent_item.is_send ? 1 : 0,
                                is_receive: parent_item.is_receive ? 1 : 0,
                                filter_value: parent_item.filter_value,
                                filter_value_min: parent_item.filter_value_min,
                                filter_value_max: parent_item.filter_value_max,
                                updated: parent_item.updated,
                                items: {},
                            };
                        }
                    }
                }
            }

            //2nd loop - parent check
            for (let person_token in organized_update) {
                let filters = organized_update[person_token];

                for (let filter_token in filters) {
                    let rows = filters[filter_token];

                    for (let token in rows) {
                        let item = rows[token];

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);

                        let filter_key = filterInfo?.parent_cache || filter.token;

                        //missing parent setup
                        if (!persons_parent_tracker[person_token]?.[filter_key]) {
                            persons_cache[person_token][filter_key] = {
                                id: item.id,
                                is_active: 1,
                                is_send: 1,
                                is_receive: 1,
                                updated: item.updated,
                                items: {},
                            };
                        }
                    }
                }
            }

            //3rd loop - items
            for (let person_token in organized_update) {
                let filters = organized_update[person_token];

                for (let filter_token in filters) {
                    let rows = filters[filter_token];

                    for (let token in rows) {
                        let item = rows[token];

                        let filter = filtersLookup.byId[item.filter_id];
                        let filterInfo = getMappingInfo(filter.token);

                        let filter_key = filterInfo?.parent_cache || filter.token;

                        if (!item.is_parent) {
                            let items = persons_cache[person_token][filter_key].items;

                            let item_extra = {};

                            let filter_map = getFilterMapByItem(item);

                            if (filter_map) {
                                let item_data;

                                try {
                                    item_data =
                                        itemsLookup[filter_map.token].byId[item[filter_map.column]];
                                } catch (e) {
                                    console.error(e);
                                    continue;
                                }

                                if (item_data) {
                                    item_extra = {
                                        token: item_data.token,
                                        name: item_data.name,
                                        [filter_map.column]: item[filter_map.column],
                                    };

                                    if (filter_map.table_key) {
                                        item_extra.table_key = filter_map.table_key;
                                    }
                                }
                            }

                            if (item.activity_type_id) {
                                item_extra.activity_type_id = item.activity_type_id;
                            }

                            if (filter.token === 'modes') {
                                item_extra.mode_token = item_extra.token;
                                delete item_extra.token;
                            }

                            if (filter.token === 'genders') {
                                item_extra.gender_token = item_extra.token;
                                delete item_extra.token;
                            }

                            items[item.id] = {
                                id: item.id,
                                is_active: item.is_active ? 1 : 0,
                                is_negative: item.is_negative ? 1 : 0,
                                importance: item.importance,
                                secondary: item.secondary_level
                                    ? JSON.parse(item.secondary_level)
                                    : null,
                                updated: item.updated,
                                deleted: item.deleted,
                                ...item_extra,
                            };
                        }
                    }
                }
            }

            let pipeline = cacheService.startPipeline();

            for (let person_token in persons_cache) {
                let person = persons_cache[person_token];

                for (let filter_token in person) {
                    //skip availability as it's handled afterwards
                    if (filter_token === 'availability') {
                        continue;
                    }

                    let filter = person[filter_token];
                    pipeline.hSet(
                        cacheService.keys.person_filters(person_token),
                        filter_token,
                        JSON.stringify(filter),
                    );
                }
            }

            try {
                await cacheService.execPipeline(pipeline);
            } catch (e) {
                console.error(e);
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function updateCacheAvailability(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!Object.keys(persons).length) {
                return resolve();
            }

            console.log('Update cache: availability');

            let conn = await dbService.conn();

            let filtersLookup = await getFilters();

            let persons_ids = {};
            let personsIdTokenMap = {};

            for (let person_token in persons) {
                let person_id = persons[person_token];
                persons_ids[person_id] = true;
                personsIdTokenMap[person_id] = person_token;
            }

            let filterAvailability = filtersLookup.byToken['availability'];

            let availability_parent_data = await conn('persons_filters')
                .where('filter_id', filterAvailability.id)
                .whereIn('person_id', Object.keys(persons_ids));

            let availability_items_data = await conn('persons_availability')
                .whereIn('person_id', Object.keys(persons_ids))
                .whereNull('deleted');

            let organized_data = {};

            for (let row of availability_parent_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if (!organized_data[person_token]) {
                    organized_data[person_token] = {
                        id: row.id,
                        is_active: row.is_active ? 1 : 0,
                        is_send: row.is_send ? 1 : 0,
                        is_receive: row.is_receive ? 1 : 0,
                        updated: row.updated,
                        items: {},
                    };
                }
            }

            for (let row of availability_items_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if (!organized_data[person_token]) {
                    organized_data[person_token] = {
                        is_active: true,
                        is_send: true,
                        is_receive: true,
                        updated: timeNow(),
                        items: {},
                    };
                }

                organized_data[person_token].items[row.token] = row;
            }

            let pipeline = cacheService.startPipeline();

            for (let person_token in organized_data) {
                pipeline.hSet(
                    cacheService.keys.person_filters(person_token),
                    'availability',
                    JSON.stringify(organized_data[person_token]),
                );
            }

            try {
                await cacheService.execPipeline(pipeline);
            } catch (e) {
                console.error('Error updating availability cache:', e);
            }
        } catch (e) {
            console.error('Error in updateCacheAvailability:', e);
            return reject(e);
        }

        resolve();
    });
}

function updateCacheNetworks(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!Object.keys(persons).length) {
                return resolve();
            }

            console.log('Update cache: networks');

            let conn = await dbService.conn();

            let filtersLookup = await getFilters();

            let persons_ids = {};
            let personsIdTokenMap = {};

            for (let person_token in persons) {
                let person_id = persons[person_token];
                persons_ids[person_id] = true;
                personsIdTokenMap[person_id] = person_token;
            }

            let filterNetworks = filtersLookup.byToken['networks'];

            let networks_parent_data = await conn('persons_filters')
                .where('filter_id', filterNetworks.id)
                .whereIn('person_id', Object.keys(persons_ids));

            let networks_items_data = await conn('persons_filters_networks')
                .whereIn('person_id', Object.keys(persons_ids))
                .whereNull('deleted');

            let organized_data = {};

            for (let row of networks_parent_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if (!organized_data[person_token]) {
                    organized_data[person_token] = {
                        id: row.id,
                        is_active: row.is_active ? 1 : 0,
                        is_send: row.is_send ? 1 : 0,
                        is_receive: row.is_receive ? 1 : 0,
                        updated: row.updated,
                        items: {},
                    };
                }
            }

            for (let row of networks_items_data) {
                let person_token = personsIdTokenMap[row.person_id];

                if (!organized_data[person_token]) {
                    organized_data[person_token] = {
                        is_active: true,
                        is_send: true,
                        is_receive: true,
                        updated: timeNow(),
                        items: {},
                    };
                }

                organized_data[person_token].items[row.token] = row;
            }

            let pipeline = cacheService.startPipeline();

            for (let person_token in organized_data) {
                pipeline.hSet(
                    cacheService.keys.person_filters(person_token),
                    'networks',
                    JSON.stringify(organized_data[person_token]),
                );
            }

            try {
                await cacheService.execPipeline(pipeline);
            } catch (e) {
                console.error('Error updating networks cache:', e);
            }
        } catch (e) {
            console.error('Error in updateCacheNetworks:', e);
            return reject(e);
        }
        resolve();
    });
}

function updateFilterGridSets(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Update grid sets: filters');

            //prepare grid set updates
            let personsGrid = {};

            for (let person_token in persons) {
                let person = persons[person_token];

                for (let filter_token in person.filters) {
                    if (filter_token === 'availability') {
                        continue;
                    }

                    if (!personsGrid[person_token]) {
                        personsGrid[person_token] = {
                            person: {
                                person_token,
                            },
                            filter_tokens: [],
                        };
                    }

                    personsGrid[person_token].filter_tokens.push(filter_token);
                }
            }

            //add modes selected to person object
            let pipeline = cacheService.startPipeline();

            let person_tokens = Object.keys(personsGrid);

            for (let person_token of person_tokens) {
                pipeline.hmGet(cacheService.keys.person(person_token), [
                    'modes',
                    'networks',
                    'gender_id',
                ]);
            }

            try {
                let results = await cacheService.execPipeline(pipeline);

                for (let i = 0; i < results.length; i++) {
                    let person_token = person_tokens[i];

                    try {
                        personsGrid[person_token].person.modes = JSON.parse(results[i][0]);
                        personsGrid[person_token].person.networks = JSON.parse(results[i][1]);
                        personsGrid[person_token].person.gender_id = JSON.parse(results[i][2]);
                    } catch (e) {
                        console.error(e);
                    }
                }
            } catch (e) {
                console.error(e);
            }

            await batchUpdateGridSets(personsGrid);
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function getSiblingTokens(token) {
    let filterMap = getFilterMapByToken(token);

    let parentToken = filterMap.parent_cache || filterMap.token;

    let tokens = [];

    for (let key in filterMappings) {
        let map = filterMappings[key];

        if (map.parent_cache === parentToken || map.token === parentToken) {
            if (map.token !== token) {
                tokens.push(map.token);
            }
        }
    }

    return tokens;
}

function getMappingInfo(filter_token) {
    if (filter_token in filterMapLookup) {
        return filterMapLookup[filter_token];
    }

    for (let k in filterMappings) {
        let filterMapping = filterMappings[k];

        if (filterMapping.token === filter_token) {
            return filterMapping;
        }
    }

    return null;
}

function getFilterMapByToken(filter_token) {
    for (let f in filterMappings) {
        if (filter_token === filterMappings[f].token) {
            return filterMappings[f];
        }
    }
}

function getFilterMapByItem(item) {
    for (let k in item) {
        if (['person_id', 'filter_id'].includes(k)) {
            continue;
        }

        let v = item[k];

        if (k.endsWith('_id') && v) {
            for (let f in filterMappings) {
                if (k === filterMappings[f].column) {
                    return filterMappings[f];
                }
            }
        }
    }

    return null;
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
        }
    })();
}
