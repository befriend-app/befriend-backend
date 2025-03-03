//retrieve data of network->person relationships from trusted befriend domains

const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');

const {
    getURL,
    joinPaths,
    loadScriptEnv,
    timeoutAwait,
    timeNow,
} = require('../../../services/shared');

const {
    getNetworkSelf,
    homeDomains,
    getNetworksLookup,
    getSecretKeyToForNetwork,
} = require('../../../services/network');
const {
    keys: systemKeys,
    getNetworkSyncProcess,
    setNetworkSyncProcess,
} = require('../../../services/system');
const { batchInsert, batchUpdate } = require('../../../services/db');

let batch_process = 1000;
let defaultTimeout = 20000;

let debug_sync_enabled = require('../../../dev/debug').sync.networks_persons;

function processNetworksPersons(persons_networks) {
    return new Promise(async (resolve, reject) => {
        if (!persons_networks || typeof persons_networks !== 'object') {
            console.error('Invalid response');
            return resolve();
        }

        let personTokens = Object.keys(persons_networks);

        if (!personTokens.length) {
            return resolve(true);
        }

        if (personTokens.length > 50000) {
            console.error('Response too large, check network data');
            return resolve();
        }

        try {
            let conn = await dbService.conn();
            let networksLookup = await getNetworksLookup();

            let batches = [];

            for (let i = 0; i < personTokens.length; i += batch_process) {
                batches.push(personTokens.slice(i, i + batch_process));
            }

            let unknown_networks = new Set();

            for (let person_tokens of batches) {
                let existingPersons = await conn('persons')
                    .whereIn('person_token', person_tokens)
                    .select('id', 'person_token', 'updated');

                let existingNetworksPersons = await conn('networks_persons AS np')
                    .join('persons AS p', 'p.id', '=', 'np.person_id')
                    .whereIn('person_token', person_tokens)
                    .select('np.id', 'np.network_id', 'np.updated', 'p.person_token');

                let personsLookup = {};
                let tokenIdMap = {};

                for (let p of existingPersons) {
                    personsLookup[p.person_token] = p;
                    tokenIdMap[p.person_token] = p.id;
                }

                let networksPersonsLookup = {};

                for (let np of existingNetworksPersons) {
                    if (!networksPersonsLookup[np.person_token]) {
                        networksPersonsLookup[np.person_token] = {};
                    }

                    let network = networksLookup.byId[np.network_id];

                    networksPersonsLookup[np.person_token][network.network_token] = np;
                }

                let batch_insert_persons = [];

                for (let token of person_tokens) {
                    if (!personsLookup[token]) {
                        let person = persons_networks[token];

                        if (person.length) {
                            let item = person[0];

                            let registration_network = null;

                            if (item.registration_network_token) {
                                registration_network =
                                    networksLookup.byToken[item.registration_network_token];

                                if (!registration_network) {
                                    unknown_networks.add(item.registration_network_token);
                                    continue;
                                }
                            } else {
                                continue;
                            }

                            if (item.network_token) {
                                let network = networksLookup.byToken[item.network_token];

                                if (!network) {
                                    unknown_networks.add(item.network_token);
                                }
                            }

                            batch_insert_persons.push({
                                registration_network_id: registration_network.id,
                                is_person_known: true,
                                person_token: token,
                                created: timeNow(),
                                updated: item.person_updated,
                            });
                        }
                    }
                }

                if (batch_insert_persons.length) {
                    await batchInsert('persons', batch_insert_persons, true);

                    for (let person of batch_insert_persons) {
                        personsLookup[person.person_token] = person;
                        tokenIdMap[person.person_token] = person.id;
                    }
                }

                let batch_insert_networks_persons = [];
                let batch_update_networks_persons = [];

                for (let person_token of person_tokens) {
                    let person = persons_networks[person_token];

                    for (let item of person) {
                        if (networksPersonsLookup[person_token]?.[item.network_token]) {
                            let existing_row =
                                networksPersonsLookup[person_token]?.[item.network_token];

                            if (item.updated > existing_row.updated) {
                                batch_update_networks_persons.push({
                                    id: existing_row.id,
                                    is_active: item.is_active,
                                    updated: item.updated,
                                    deleted: item.deleted || null,
                                });
                            }
                        } else {
                            let db_person = personsLookup[person_token];

                            if (!db_person) {
                                console.warn('Person not found in DB');
                                continue;
                            }

                            let network = networksLookup.byToken[item.network_token];

                            if (!network) {
                                console.warn('Network not found in DB');
                                continue;
                            }

                            batch_insert_networks_persons.push({
                                network_id: network.id,
                                person_id: db_person.id,
                                is_active: item.is_active,
                                created: timeNow(),
                                updated: item.updated,
                                deleted: item.deleted || null,
                            });
                        }
                    }
                }

                if (batch_insert_networks_persons.length) {
                    await batchInsert('networks_persons', batch_insert_networks_persons);
                }

                if (batch_update_networks_persons.length) {
                    await batchUpdate('networks_persons', batch_update_networks_persons);
                }
            }

            if (unknown_networks.size) {
                console.warn('Unknown networks: ', Array.from(unknown_networks));
            }

            return resolve(!unknown_networks.size);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function syncNetworksPersons() {
    console.log('Sync: networks->persons');

    let sync_name = systemKeys.sync.network.networks_persons;

    return new Promise(async (resolve, reject) => {
        let conn,
            network_self,
            home_networks = [];

        try {
            network_self = await getNetworkSelf();
        } catch (e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject();
        }

        try {
            let home_domains = await homeDomains();

            conn = await dbService.conn();

            let networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);

            for (let domain of home_domains) {
                for (let network of networks) {
                    if (network.api_domain.includes(domain)) {
                        home_networks.push(network);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }

        for (let network of home_networks) {
            try {
                let t = timeNow();

                //in case of error, do not save new last timestamp
                let skipSaveTimestamps = false;

                //if error with one network, catch error and continue to next network
                let timestamps = {
                    current: timeNow(),
                    last: null,
                };

                //request latest data only on subsequent syncs
                let sync_qry = await getNetworkSyncProcess(sync_name, network.network_id);

                if (sync_qry && !debug_sync_enabled) {
                    timestamps.last = sync_qry.last_updated;
                }

                let sync_url = getURL(network.api_domain, joinPaths('sync', 'networks-persons'));

                //security_key
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

                let success = await processNetworksPersons(response.data.networks_persons);

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
                            },
                        });

                        if (response.status !== 202) {
                            break;
                        }

                        let success = await processNetworksPersons(response.data.networks_persons);

                        if (!success) {
                            skipSaveTimestamps = true;
                        }
                    } catch (e) {
                        console.error(e);
                        skipSaveTimestamps = true;
                        break;
                    }
                }

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

        resolve();
    });
}

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncNetworksPersons();
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
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
