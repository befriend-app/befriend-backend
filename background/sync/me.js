const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const meService = require('../../services/me');

const { getNetworkSelf, getSecretKeyToForNetwork } = require('../../services/network');
const { keys: systemKeys } = require('../../services/system');
const { batchInsert, batchUpdate } = require('../../services/db');
const { getAllSections } = require('../../services/me');
const sectionsData = require('../../services/sections_data');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
} = require('../../services/shared');
const { batchUpdateGridSets } = require('../../services/filters');

let batch_process = 1000;
let defaultTimeout = 20000;

let tableLookup = {};

let debug_sync_enabled = require('../../dev/debug').sync.me;

function getTableInfo(table_name) {
    if(table_name in tableLookup) {
        return tableLookup[table_name];
    }

    for(let k in sectionsData) {
        let sectionData = sectionsData[k];

        for(let t in sectionData.tables) {
            let tableData = sectionData.tables[t];

            if(tableData.user.name === table_name) {
                let data = {
                    section_key: k,
                    table_key: t,
                    is_favorable: tableData.isFavorable,
                    source_table: tableData.data.name,
                    col_id: tableData.user.cols.id,
                    col_token: tableData.user.cols.token || null,
                    col_secondary: tableData.user.cols.secondary || null,
                    cache_key: sectionData.cacheKeys?.[t].byHash || null,
                    cache_key_hash: sectionData.cacheKeys?.[t].byHashKey || null,
                    data_fn: sectionData.functions?.data || null
                };

                tableLookup[table_name] = data;

                return data;
            }
        }
    }
}

function processMe(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons?.length) {
            return resolve();
        }

        if(persons.length > 50000) {
            console.error("Response too large, check network data");
            return resolve();
        }

        let has_invalid_persons = false;

        try {
            let conn = await dbService.conn();

            let batchPersonTokens = [];
            let schemaItemsLookup = {};
            let duplicateTracker = {};
            let lookupPipelines = {};
            let personsDict = {};
            let invalidPersons = {};
            let validPersons = [];

            schemaItemsLookup.persons_sections = await getAllSections(true);

            //validate provided persons
            for(let person of persons) {
                batchPersonTokens.push(person.person_token);
                personsDict[person.person_token] = person;
            }

            let existingNetworksPersons = await conn('networks_persons AS np')
                .join('persons AS p', 'p.id', '=', 'np.person_id')
                .where('network_id', network_id)
                .whereIn('person_token', batchPersonTokens)
                .select('p.id', 'p.person_token', 'p.updated');

            let personsIdTokenMap = {};
            let personsLookup = {};

            for(let person of existingNetworksPersons) {
                personsLookup[person.person_token] = person;
                personsIdTokenMap[person.id] = person.person_token;
            }

            for(let person of persons) {
                if(personsLookup[person.person_token]) {
                    validPersons.push(personsDict[person.person_token]);
                } else {
                    invalidPersons[person.person_token] = true;
                    has_invalid_persons = true;
                }
            }

            if (Object.keys(invalidPersons).length) {
                console.warn({
                    invalid_persons_count: Object.keys(invalidPersons).length,
                });
            }

            for(let person of validPersons) {
                for(let section in person.me) {
                    if(!(schemaItemsLookup[section])) {
                        schemaItemsLookup[section] = {
                            byId: {},
                            byToken: {}
                        };

                        duplicateTracker[section] = {};

                        lookupPipelines[section] = cacheService.startPipeline();
                    }

                    let section_table = getTableInfo(section);

                    let items = person.me[section];

                    for(let token in items) {
                        let item = items[token];

                        if(token in duplicateTracker[section]) {
                            continue;
                        }

                        duplicateTracker[section][token] = true;

                        if(section_table.cache_key) {
                            lookupPipelines[section].hGet(section_table.cache_key, item.token);
                        } else if(section_table.cache_key_hash) {
                            lookupPipelines[section].hGet(section_table.cache_key_hash(item.hash_token), item.token);
                        }
                    }
                }
            }

            for(let section in lookupPipelines) {
                try {
                     let results = await cacheService.execPipeline(lookupPipelines[section]);

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
            for(let section in schemaItemsLookup) {
                let tableInfo = getTableInfo(section);
                let items = schemaItemsLookup[section].byId;

                if(!Object.keys(items).length && tableInfo.data_fn) {
                    try {
                         let options = await meService[tableInfo.data_fn]({
                             options_only: true
                         });

                         for(let option of options) {
                             schemaItemsLookup[section].byId[option.id] = option;
                             schemaItemsLookup[section].byToken[option.token] = option;
                         }
                    } catch(e) {
                        console.error(e);
                    }
                }
            }

            //batch process/insert/update
            let batches = [];

            for (let i = 0; i < validPersons.length; i += batch_process) {
                batches.push(validPersons.slice(i, i + batch_process));
            }

            for (let batch of batches) {
                function organizeSectionsCache(items) {
                    for(let id in items) {
                        let item = items[id];

                        if(item.deleted) {
                            continue;
                        }

                        let section = schemaItemsLookup.persons_sections.byId[item.section_id];

                        if(!section) {
                            console.warn("No section item");
                            continue;
                        }

                        let person_token = personsIdTokenMap[item.person_id];
                        let person_cache = persons_cache[person_token];

                        if(!(person_cache.active)) {
                            person_cache.active = {};
                        }

                        if(!person_cache.active[section.token]) {
                            person_cache.active[section.token] = {
                                id: item.id,
                                person_id: item.person_id,
                                section_id: item.section_id,
                                position: item.position,
                                updated: item.updated,
                                deleted: item.deleted
                            }
                        }
                    }
                }

                function organizeItemsCache(table, items) {
                    //prepare for cache
                    let tableInfo = getTableInfo(table);

                    for(let item of items) {
                        //do not save deleted item to cache
                        if(item.deleted) {
                            continue;
                        }

                        let person_token = personsIdTokenMap[item.person_id];
                        let person_cache = persons_cache[person_token];

                        if(!(person_cache[tableInfo.section_key])) {
                            person_cache[tableInfo.section_key] = {};
                        }

                        let item_id = item[tableInfo.col_id];

                        let db_item = schemaItemsLookup[table].byId[item_id];

                        if(!db_item) {
                            console.warn("No me item");
                            continue;
                        }

                        let cache_item = person_cache[tableInfo.section_key][db_item.token] = {
                            id: item.id,
                            [tableInfo.col_id]: db_item.id,
                            token: db_item.token,
                            table_key: tableInfo.table_key,
                            ...(tableInfo.col_secondary && { secondary: item[tableInfo.col_secondary] || null }),
                            updated: item.updated,
                        }

                        if(db_item.name) {
                            cache_item.name = db_item.name;
                        }

                        if(item.is_favorite) {
                            cache_item.is_favorite = item.is_favorite || null;
                            cache_item.favorite_position = item.favorite_position || null;
                        }

                        if(tableInfo.col_secondary) {
                            cache_item.secondary = item[tableInfo.col_secondary] || null;
                        }
                    }
                }

                let pipeline = cacheService.startPipeline();

                //setup table inserts/updates
                let batch_insert = {
                    persons_sections: []
                };

                let batch_update = {
                    persons_sections: []
                };

                for(let person of batch) {
                    for(let table in person.me) {
                        batch_insert[table] = [];
                        batch_update[table] = [];
                    }
                }

                let existingPersonsIds = [];

                for(let p of batch) {
                    let person = personsLookup[p.person_token];
                    existingPersonsIds.push(person.id);
                }

                //Existing data for all tables
                let existingData = {};
                let existingDataLookup = {};

                for (let table in batch_insert) {
                    existingData[table] = await conn(table)
                        .whereIn('person_id', existingPersonsIds)
                        .select('*');
                }

                //find missing schema items from existing data
                for(let table_name in existingData) {
                    let tableInfo = getTableInfo(table_name);
                    let item_col = tableInfo?.col_id;

                    if (table_name === 'persons_sections') {
                        continue;
                    }

                    let missingIds = new Set();

                    for (let item of existingData[table_name]) {
                        if (!schemaItemsLookup[table_name]?.byId[item[item_col]]) {
                            missingIds.add(item[item_col]);
                        }
                    }

                    if (missingIds.size > 0) {
                        if(tableInfo.source_table) {
                            try {
                                let options = await conn(tableInfo.source_table)
                                    .whereIn('id', Array.from(missingIds));

                                for (let option of options) {
                                    schemaItemsLookup[table_name].byId[option.id] = option;
                                    schemaItemsLookup[table_name].byToken[option.token] = option;
                                }
                            } catch(e) {
                                console.error(e);
                            }

                        } else {
                            console.warn("No table information for missing schema");
                            continue;
                        }
                    }
                }

                for(let table_name in existingData) {
                    existingDataLookup[table_name] = {};

                    let tableInfo = getTableInfo(table_name);
                    let item_col = tableInfo?.col_id;

                    if(table_name === 'persons_sections') {
                        item_col = 'section_id';
                    }

                    for(let item of existingData[table_name]) {
                        let person_token = personsIdTokenMap[item.person_id];

                        if(!person_token) {
                            console.warn("No person token");
                            continue;
                        }

                        if(!(person_token in existingDataLookup[table_name])) {
                            existingDataLookup[table_name][person_token] = {};
                        }

                        let db_item = schemaItemsLookup[table_name].byId[item[item_col]]

                        if(!db_item) {
                            console.warn("No db item");
                            continue;
                        }

                        existingDataLookup[table_name][person_token][db_item.token] = item;
                    }
                }

                let persons_cache = {};

                // Process each person
                for (let person of batch) {
                    let person_token = person.person_token;

                    let existingPerson = personsLookup[person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    let person_cache = persons_cache[person_token] = {
                        active: {}
                    };

                    if (person.sections) {
                        for (const [token, section] of Object.entries(person.sections)) {
                            let db_item = schemaItemsLookup.persons_sections.byToken[token];

                            if(!db_item) {
                                console.warn("No section item");
                                continue;
                            }

                            let existingSection = existingDataLookup.persons_sections[person_token]?.[token];

                            let sectionData = {
                                person_id: existingPerson.id,
                                section_id: db_item.id,
                                position: section.position,
                                updated: section.updated,
                                deleted: section.deleted || null
                            };

                            if (existingSection) {
                                if (section.updated > existingSection.updated) {
                                    sectionData.id = existingSection.id;
                                    batch_update.persons_sections.push(sectionData);
                                }
                            } else {
                                sectionData.created = timeNow();
                                batch_insert.persons_sections.push(sectionData);
                            }

                            //prepare sections for cache
                            person_cache['active'][token] = sectionData;
                        }
                    }

                    // Process me data
                    if (person.me) {
                        for (let [table, items] of Object.entries(person.me)) {
                            let tableInfo = getTableInfo(table);

                            for (let [token, item] of Object.entries(items)) {
                                let db_item = schemaItemsLookup[table].byToken[token];

                                if(!db_item) {
                                    console.warn("No me item");
                                    continue;
                                }

                                let existingItem = existingDataLookup[table][person_token]?.[token];

                                let itemData = {
                                    person_id: existingPerson.id,
                                    updated: item.updated,
                                    deleted: item.deleted
                                };

                                itemData[tableInfo.col_id] = db_item.id;

                                if(tableInfo.col_token) {
                                    itemData[tableInfo.col_token] = token;
                                }

                                if(tableInfo.is_favorable) {
                                    itemData.is_favorite = item.is_favorite || null;
                                    itemData.favorite_position = item.favorite_position || null;
                                }

                                if(tableInfo.col_secondary) {
                                    itemData[tableInfo.col_secondary] = item[tableInfo.col_secondary];
                                }

                                if(item.hash_token) {
                                    itemData.hash_token = item.hash_token;
                                }

                                if (existingItem) {
                                    if (item.updated > existingItem.updated) {
                                        itemData.id = existingItem.id;
                                        batch_update[table].push(itemData);
                                    }
                                } else {
                                    itemData.created = timeNow();
                                    batch_insert[table].push(itemData);
                                }
                            }
                        }
                    }
                }

                let hasChange = false;
                let prepareCache = {};

                for (const [table, items] of Object.entries(batch_insert)) {
                    if (items.length) {
                        hasChange = true;
                        await batchInsert(table, items, true);

                        prepareCache[table] = items;
                    }
                }

                for (const [table, items] of Object.entries(batch_update)) {
                    if (items.length) {
                        hasChange = true;
                        await batchUpdate(table, items);

                        if(prepareCache[table]) {
                            prepareCache[table] = prepareCache[table].concat(items);
                        } else {
                            prepareCache[table] = items;
                        }
                    }
                }

                if(!hasChange) {
                    return resolve();
                }

                for(let table in prepareCache) {
                    let items = prepareCache[table];

                    let items_prepared = {};

                    for(let item of items) {
                        items_prepared[item.id] = item;
                    }

                    if(existingData[table]) {
                        for(let item of existingData[table]) {
                            if(!(item.id in items_prepared)) {
                                items_prepared[item.id] = item;
                            }
                        }
                    }

                    if(table === 'persons_sections') {
                        organizeSectionsCache(items_prepared);
                    } else {
                        organizeItemsCache(table, Object.values(items_prepared));
                    }
                }

                let personsGrids = {};

                for(let person_token in persons_cache) {
                    personsGrids[person_token] = {
                        person: {
                            person_token
                        },
                        items: {},
                        filter_tokens: []
                    }

                    let sections = persons_cache[person_token];

                    let cache_key = cacheService.keys.person_sections(person_token);

                    for(let section in sections) {
                        let data = sections[section];

                        pipeline.hSet(cache_key, section, JSON.stringify(data));

                        if(section !== 'active') {
                            personsGrids[person_token].items[section] = data;
                            personsGrids[person_token].filter_tokens.push(section);
                        }
                    }
                }

                await cacheService.execPipeline(pipeline);

                await batchUpdateGridSets(personsGrids);
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve(!has_invalid_persons);
    });
}

function syncMe() {
    console.log("Sync: me");

    let sync_name = systemKeys.sync.network.persons_me;

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
            return reject();
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
                    let ts = timeNow();

                    //in case of error, do not save new last timestamp
                    let skipSaveTimestamps = false;

                    //if error with one network, catch error and continue to next network
                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    //request latest data only on subsequent syncs
                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if (sync_qry && !debug_sync_enabled) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons/me'));

                    //security_key
                    let secret_key_to = await getSecretKeyToForNetwork(network.id);

                    if (!secret_key_to) {
                        continue;
                    }

                    const axiosInstance = axios.create({
                        timeout: defaultTimeout
                    });

                    let response = await axiosInstance.get(sync_url, {
                        params: {
                            secret_key: secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow(),
                        }
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    let success = await processMe(network.id, response.data.persons);

                    if (!success) {
                        skipSaveTimestamps = true;
                    }

                    //handle paging, ~10,000 results
                    while (response.data.pagination_updated) {
                        try {
                            response = await axiosInstance.get(sync_url, {
                                params: {
                                    secret_key: secret_key_to,
                                    network_token: network_self.network_token,
                                    pagination_updated: response.data.pagination_updated,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow(),
                                }
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            let success = await processMe(network.id, response.data.persons);

                            if (!success) {
                                skipSaveTimestamps = true;
                            }
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    //todo remove
                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        //update sync table
                        if (sync_qry) {
                            await conn('sync').where('id', sync_qry.id).update({
                                last_updated: timestamps.current,
                                updated: timeNow(),
                            });
                        } else {
                            await conn('sync').insert({
                                sync_process: sync_name,
                                network_id: network.id,
                                last_updated: timestamps.current,
                                created: timeNow(),
                                updated: timeNow(),
                            });
                        }
                    }

                    console.log({
                        process_time: timeNow() - ts,
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

            await syncMe();
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