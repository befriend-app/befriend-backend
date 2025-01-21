const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const meService = require('../../services/me');

const { getNetworkSelf } = require('../../services/network');
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
const { getFilters } = require('../../services/filters');

let batch_process = 1000;
let defaultTimeout = 20000;

function processFilters(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let filtersLookup = await getFilters();

            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            let t = timeNow();

            for (let batch of batches) {
                let batch_insert = {};
                let batch_update = {};

                const batchPersonTokens = batch.map(p => p.person_token);

                const existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated');

                // Create lookup maps
                let personsLookup = {};

                for (const person of existingPersons) {
                    personsLookup[person.person_token] = person;
                }

                // Get existing filter data
                let existingFilters = await conn('persons_filters')
                    .whereIn('person_id', existingPersons.map(p => p.id))
                    .select('*');

                // Organize existing filters by person and filter
                let existingFiltersLookup = {};

                for (let filter of existingFilters) {
                    let person = existingPersons.find(p => p.id === filter.person_id);

                    if (!person) {
                        continue;
                    }

                    if (!existingFiltersLookup[person.person_token]) {
                        existingFiltersLookup[person.person_token] = {};
                    }

                    let filterToken = Object.values(filtersLookup.byId).find(f => f.id === filter.filter_id)?.token;

                    if (!filterToken) {
                        continue;
                    }

                    existingFiltersLookup[person.person_token][filterToken] = filter;
                }

                // Process each person's filters
                for (let person of batch) {
                    let existingPerson = personsLookup[person.person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    // Process filters
                    if (person.filters) {
                        for (let [filter_token, filter_data] of Object.entries(person.filters)) {
                            let filter = filtersLookup.byToken[filter_token];

                            if (!filter) {
                                continue;
                            }

                            let existingFilter = existingFiltersLookup[person.person_token]?.[filter_token];

                            let filterData = {
                                person_id: existingPerson.id,
                                filter_id: filter.id,
                                is_send: filter_data.is_send,
                                is_receive: filter_data.is_receive,
                                is_active: filter_data.is_active,
                                is_negative: filter_data.is_negative,
                                updated: filter_data.updated,
                                deleted: filter_data.deleted
                            };

                            // Add optional fields if present
                            if ('filter_value' in filter_data) filterData.filter_value = filter_data.filter_value;
                            if ('filter_value_min' in filter_data) filterData.filter_value_min = filter_data.filter_value_min;
                            if ('filter_value_max' in filter_data) filterData.filter_value_max = filter_data.filter_value_max;
                            if ('importance' in filter_data) filterData.importance = filter_data.importance;
                            if ('secondary_level' in filter_data) {
                                filterData.secondary_level = typeof filter_data.secondary_level === 'string' ?
                                    filter_data.secondary_level :
                                    JSON.stringify(filter_data.secondary_level);
                            }

                            if (!batch_insert[filter_token]) {
                                batch_insert[filter_token] = [];
                                batch_update[filter_token] = [];
                            }

                            if (existingFilter) {
                                if (filter_data.updated > existingFilter.updated) {
                                    filterData.id = existingFilter.id;
                                    batch_update[filter_token].push(filterData);
                                }
                            } else {
                                filterData.created = timeNow();
                                batch_insert[filter_token].push(filterData);
                            }
                        }
                    }
                }

                // Execute batch operations
                for (const [filter_token, items] of Object.entries(batch_insert)) {
                    if (items.length) {
                        await batchInsert('persons_filters', items, true);
                    }
                }

                for (const [filter_token, items] of Object.entries(batch_update)) {
                    if (items.length) {
                        await batchUpdate('persons_filters', items);
                    }
                }

                // Update caches
                let pipeline = cacheService.startPipeline();

                for (let person of batch) {
                    if (!person.filters) {
                        continue;
                    }

                    let cache_key = cacheService.keys.person_filters(person.person_token);

                    for (let [filter_token, filter_data] of Object.entries(person.filters)) {
                        pipeline.hSet(cache_key, filter_token, JSON.stringify(filter_data));
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

                    // await processFilters(network.id, response.data.persons);

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

                            // await processFilters(network.id, response.data.persons);
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