const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
} = require('../../services/shared');
const { getNetworkSelf } = require('../../services/network');
const { keys: systemKeys } = require('../../services/system');
const { batchInsert, batchUpdate } = require('../../services/db');
const { getAllSections } = require('../../services/me');
const sectionsData = require('../../services/sections_data');

let batch_process = 1000;
let defaultTimeout = 10000;

let tableLookup = {};

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
                    cache_key: sectionData.cacheKeys[t].byHash || null,
                    cache_key_hash: sectionData.cacheKeys[t].byHashKey || null,
                };

                tableLookup[table_name] = data;

                return data;
            }
        }
    }
}

function processMe(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let sectionsLookup = await getAllSections(true);

            let lookup_pipelines = {};
            let schemaItemsLookup = {};

            for(let person of persons) {
                for(let section in person.me) {
                    if(!(lookup_pipelines[section])) {
                        lookup_pipelines[section] = cacheService.startPipeline();
                    }

                    let section_table = getTableInfo(section);

                    let items = person.me[section];

                    for(let token in items) {
                        let item = items[token];

                        if(section_table.cache_key) {
                            lookup_pipelines[section].hGet(section_table.cache_key, item.token);
                        }
                    }
                }
            }

            for(let section in lookup_pipelines) {
                try {
                     let results = await cacheService.execPipeline(lookup_pipelines[section]);

                     for(let result of results) {
                         result = JSON.parse(result);
                         schemaItemsLookup[section][result.token] = result;
                     }
                } catch(e) {
                    console.error(e);
                }
            }

            //batch process/insert/update
            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            let t = timeNow();

            for (let batch of batches) {
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

                const batchPersonTokens = batch.map(p => p.person_token);

                const existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated');

                const existingPersonsIds = existingPersons.map(p => p.id);

                //lookup maps
                let personsIdTokenMap = {};
                let personsLookup = {};

                for (const person of existingPersons) {
                    personsLookup[person.person_token] = person;
                    personsIdTokenMap[person.id] = person.person_token;
                }

                //Existing data for all tables
                let existingData = {};
                let existingDataLookup = {};

                for (let table in batch_insert) {
                    existingData[table] = await conn(table)
                        .whereIn('person_id', existingPersonsIds)
                        .select('*');
                }

                for(let table in existingData) {
                    existingDataLookup[table] = {};
                }

                for(let item of existingData.persons_sections) {
                    let person_token = personsIdTokenMap[item.person_id];

                    if(!person_token) {
                        console.warn("No person token");
                        continue;
                    }

                    if(!(person_token in existingDataLookup.persons_sections)) {
                        existingDataLookup.persons_sections[person_token] = {};
                    }

                    let db_item = sectionsLookup.byId[item.section_id];

                    if(!db_item) {
                        console.warn("No db item");
                        continue;
                    }

                    existingDataLookup.persons_sections[person_token][db_item.token] = item;
                }

                // Process each person
                for (let person of batch) {
                    let person_token = person.person_token;

                    let existingPerson = personsLookup[person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    if (person.sections) {
                        for (const [token, section] of Object.entries(person.sections)) {
                            let section_db = sectionsLookup.byKey[token];

                            if(!section_db) {
                                continue;
                            }

                            const existingSection = existingDataLookup.persons_sections[person_token]?.[token];

                            const sectionData = {
                                person_id: existingPerson.id,
                                section_id: section_db.id,
                                position: section.position,
                                updated: section.updated,
                                deleted: section.deleted
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
                        }
                    }

                    // Process me data
                    if (0 && person.me) {
                        for (const [table, items] of Object.entries(person.me)) {
                            const tableData = existingData[table];

                            for (const [token, item] of Object.entries(items)) {
                                const existingItem = tableData.find(t =>
                                    t.person_id === existingPerson.id && t.token === token
                                );

                                const itemData = {
                                    person_id: existingPerson.id,
                                    token: token,
                                    updated: item.updated,
                                    deleted: item.deleted
                                };

                                // Add favorable data if applicable
                                if ('is_favorite' in item) {
                                    itemData.is_favorite = item.is_favorite;
                                    itemData.favorite_position = item.favorite_position;
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

                for (const [table, items] of Object.entries(batch_insert)) {
                    if (items.length) {
                        await batchInsert(table, items);
                    }
                }

                for (const [table, items] of Object.entries(batch_update)) {
                    if (items.length) {
                        await batchUpdate(table, items);
                    }
                }

                await cacheService.execPipeline(pipeline);
            }

            console.log({
                process_time: timeNow() - t
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

function syncMe() {
    let sync_name = systemKeys.sync.network.persons_me;

    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch(e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network', e);
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

                    if (sync_qry) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons/me'));

                    //security_key
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

                    await processMe(network.id, response.data.persons);

                    //handle paging, ~10,000 results
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

                            await processMe(network.id, response.data.persons);
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    //todo remove
                    if (0 && !skipSaveTimestamps) {
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