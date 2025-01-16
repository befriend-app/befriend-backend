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
const { deleteKeys } = require('../../services/cache');
const { getGendersLookup } = require('../../services/genders');
const { keys: systemKeys } = require('../../services/system');
const { getGridLookup } = require('../../services/grid');
const { batchInsert, batchUpdate } = require('../../services/db');

const sync_name = systemKeys.sync.network.persons;

let batch_process = 1000;

function processPersons(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let gridLookup = await getGridLookup();
            let genders = await getGendersLookup();

            //batch process/insert/update
            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            let t = timeNow();

            for (let batch of batches) {
                // Get existing persons for this batch
                const batchPersonTokens = batch.map(p => p.person_token);
                const existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated', 'deleted');

                //persons lookup
                const existingPersonsDict = {};
                for (const p of existingPersons) {
                    existingPersonsDict[p.person_token] = p;
                }

                // Prepare batch inserts and updates
                const personsToInsert = [];
                const personsToUpdate = [];
                const networksToInsert = [];

                // Get all existing network_persons
                const existingPersonIds = existingPersons.map(p => p.id);
                const existingNetworks = await conn('persons_networks')
                    .where('network_id', network_id)
                    .whereIn('person_id', existingPersonIds)
                    .select('person_id');

                //persons networks lookup
                const existingNetworksDict = {};

                for (const network of existingNetworks) {
                    existingNetworksDict[network.person_id] = true;
                }

                //todo - prepare grid set data

                // Process each person in the batch
                for (const person of batch) {
                    if (!person) {
                        continue;
                    }

                    const grid_id = gridLookup.byToken[person.grid_token]?.id || null
                    const gender_id = genders.byToken[person.gender_token]?.id || null;

                    const existingPerson = existingPersonsDict[person.person_token];

                    if (!existingPerson) {
                        // Skip deleted persons
                        if (person.deleted) {
                            continue;
                        }

                        // New person
                        personsToInsert.push({
                            network_id,
                            grid_id,
                            gender_id,
                            person_token: person.person_token,
                            modes: person.modes,
                            is_verified_in_person: person.is_verified_in_person,
                            is_verified_linkedin: person.is_verified_linkedin,
                            is_online: person.is_online,
                            timezone: person.timezone,
                            reviews_count: person.reviews_count,
                            rating_safety: person.rating_safety,
                            rating_trust: person.rating_trust,
                            rating_timeliness: person.rating_timeliness,
                            rating_friendliness: person.rating_friendliness,
                            rating_fun: person.rating_fun,
                            age: person.age,
                            is_blocked: person.is_blocked,
                            created: timeNow(),
                            updated: person.updated
                        });
                    } else if (person.updated > existingPerson.updated) {
                        // Existing person needs update
                        personsToUpdate.push({
                            id: existingPerson.id,
                            grid_id, //how to update grid sets with prev grid token
                            gender_id,
                            mode: person.mode,
                            is_verified_in_person: person.is_verified_in_person,
                            is_verified_linkedin: person.is_verified_linkedin,
                            is_online: person.is_online,
                            timezone: person.timezone,
                            reviews_count: person.reviews_count,
                            rating_safety: person.rating_safety,
                            rating_trust: person.rating_trust,
                            rating_timeliness: person.rating_timeliness,
                            rating_friendliness: person.rating_friendliness,
                            rating_fun: person.rating_fun,
                            age: person.age,
                            is_blocked: person.is_blocked,
                            updated: person.updated,
                            deleted: person.deleted || null
                        });
                    }

                    // Check if we need to create network association
                    if (existingPerson && !existingNetworksDict[existingPerson.id]) {
                        networksToInsert.push({
                            person_id: existingPerson.id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: timeNow()
                        });
                    }
                }

                // Perform batch operations
                if (personsToInsert.length > 0) {
                    await batchInsert('persons', personsToInsert, true);

                    for(let p of personsToUpdate) {
                        networksToInsert.push({
                            person_id: p.id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: timeNow()
                        })
                    }
                }

                if (personsToUpdate.length > 0) {
                    await batchUpdate('persons', personsToUpdate);
                }

                if (networksToInsert.length > 0) {
                    await batchInsert('persons_networks', networksToInsert);
                }
            }

            console.log({
                process_time: timeNow() - t
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        return resolve();
    });
}

function updatePersonsCount() {
    return new Promise(async (resolve, reject) => {
        try {
            let network_self = await getNetworkSelf();

            if (!network_self.is_befriend) {
                return resolve();
            }

            let conn = await dbService.conn();

            let networks_persons = await conn('persons_networks AS pn')
                .join('persons AS p', 'p.id', '=', 'pn.person_id')
                .where('pn.network_id', '<>', network_self.id)
                .whereNull('pn.deleted')
                .whereNull('p.deleted')
                .select('pn.id', 'pn.network_id', 'pn.person_id');

            let network_count = {};

            for (let item of networks_persons) {
                if (!(item.network_id in network_count)) {
                    network_count[item.network_id] = 0;
                }

                network_count[item.network_id]++;
            }

            for (let network_id in network_count) {
                await conn('networks').where('id', network_id).update({
                    persons_count: network_count[network_id],
                    updated: timeNow(),
                });
            }

            await deleteKeys([cacheService.keys.networks, cacheService.keys.networks_filters]);
        } catch (e) {
            console.error(e);
        }
    });
}

function syncPersons() {
    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            conn = await dbService.conn();

            try {
                network_self = await getNetworkSelf();

                if (!network_self) {
                    throw new Error();
                }
            } catch (e) {
                console.error('Error getting own network', e);
                await timeoutAwait(5000);
                return reject(e);
            }

            //networks to sync data with
            //networks can be updated through the sync_networks background process
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

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons'));

                    //security_key
                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_to_qry) {
                        continue;
                    }

                    let response = await axios.post(sync_url, {
                        secret_key: secret_key_to_qry.secret_key_to,
                        network_token: network_self.network_token,
                        data_since: timestamps.last,
                        request_sent: timeNow(),
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersons(network.id, response.data.persons);

                    //handle paging, ~10,000 results
                    while (response.data.last_person_token) {
                        try {
                            response = await axios.post(sync_url, {
                                secret_key: secret_key_to_qry.secret_key_to,
                                network_token: network_self.network_token,
                                last_person_token: response.data.last_person_token,
                                prev_data_since: response.data.prev_data_since,
                                request_sent: timeNow(),
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            await processPersons(network.id, response.data.persons);
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    if (!skipSaveTimestamps) {
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
            await syncPersons();
            await updatePersonsCount();
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