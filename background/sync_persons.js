const axios = require('axios');

const cacheService = require('../services/cache');
const dbService = require('../services/db');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
    birthDatePure,
} = require('../services/shared');
const { getNetworkSelf } = require('../services/network');
const { setCache, deleteKeys } = require('../services/cache');
const { encrypt } = require('../services/encryption');
const { getGendersLookup } = require('../services/genders');
const { keys: systemKeys } = require('../services/system');

const sync_name = systemKeys.sync.network.persons;

const runInterval = 60 * 30 * 1000; //every 30 minutes

function processPersons(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let genders = await getGendersLookup();

            for (let person of persons) {
                if(!person) {
                    continue;
                }

                let gender_id = null;

                if (person.gender?.gender_token) {
                    let gender = genders.byToken[person.gender.gender_token];

                    if (gender) {
                        gender_id = gender.id;
                    }
                }

                //de-duplicate
                let person_check = await conn('persons')
                    .where('person_token', person.person_token)
                    .first();

                //add to persons and persons_networks
                if (!person_check) {
                    if(person.deleted) { //do not create new record for deleted person
                        continue;
                    }

                    let person_id = await conn('persons').insert({
                        person_token: person.person_token,
                        network_id: network_id,
                        mode: person.mode,
                        is_verified_in_person: person.is_verified_in_person,
                        is_verified_linkedin: person.is_verified_linkedin,
                        is_online: person.is_online,
                        gender_id: gender_id,
                        reviews_count: person.reviews_count,
                        reviews_rating: person.reviews_rating,
                        age: person.age,
                        birth_date: birthDatePure(person.birth_date), //todo convert to age
                        is_blocked: person.is_blocked,
                        created: timeNow(),
                        updated: timeNow(),
                    });

                    person_id = person_id[0];

                    await conn('persons_networks').insert({
                        person_id: person_id,
                        network_id: network_id,
                        created: timeNow(),
                        updated: person.updated,
                    });
                } else {
                    //person could possibly already exist but joined with a new (second) network
                    let pn_check = await conn('persons_networks')
                        .where('person_id', person_check.id)
                        .where('network_id', network_id)
                        .first();

                    if (!pn_check) {
                        await conn('persons_networks').insert({
                            person_id: person_check.id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: timeNow(),
                        });
                    }

                    //update if timestamp changed
                    //updated col is set by network where data is retrieved from
                    if (person.updated > person_check.updated) {
                        await conn('persons')
                            .where('person_id', person_check.id)
                            .update({
                                mode: person.mode,
                                is_verified_in_person: person.is_verified_in_person,
                                is_verified_linkedin: person.is_verified_linkedin,
                                is_online: person.is_online,
                                gender_id: gender_id,
                                reviews_count: person.reviews_count,
                                reviews_rating: person.reviews_rating,
                                age: person.age,
                                birth_date: birthDatePure(person.birth_date), //todo remove
                                is_blocked: person.is_blocked,
                                updated: person.updated,
                                deleted: person.deleted || null
                            });
                    }
                }
            }
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

             if(!network_self.is_befriend) {
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

             for(let item of networks_persons) {
                 if(!(item.network_id in network_count)) {
                     network_count[item.network_id] = 0;
                 }

                 network_count[item.network_id]++;
             }

             for(let network_id in network_count) {
                 await conn('networks')
                     .where('id', network_id)
                     .update({
                         persons_count: network_count[network_id],
                         updated: timeNow()
                     });
             }

            await deleteKeys([cacheService.keys.networks, cacheService.keys.networks_filters]);
        } catch(e) {
            console.error(e);
        }
    });
}

(async function () {
    loadScriptEnv();
    let network_self;

    try {
        network_self = await getNetworkSelf();
    } catch(e) {
        console.error(e);
        process.exit(1);
    }

    while (true) {
        let conn, networks;

        try {
            conn = await dbService.conn();

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

                    let sync_url = getURL(network.api_domain, joinPaths('sync', sync_name));

                    //security_key
                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_to_qry) {
                        continue;
                    }

                    let encrypted_network_token = await encrypt(
                        secret_key_to_qry.secret_key_to,
                        network_self.network_token,
                    );

                    let response = await axios.post(sync_url, {
                        request_sent: timeNow(),
                        data_since: timestamps.last,
                        network_token: network_self.network_token,
                        encrypted_network_token: encrypted_network_token,
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersons(network.id, response.data.persons);

                    //handle paging, ~10,000 results
                    while (response.data.last_person_token) {
                        try {
                            response = await axios.post(sync_url, {
                                request_sent: timeNow(),
                                prev_data_since: response.data.prev_data_since,
                                network_token: network_self.network_token,
                                encrypted_network_token: encrypted_network_token,
                                last_person_token: response.data.last_person_token,
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

                    if(!skipSaveTimestamps) {
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

        await updatePersonsCount();

        await timeoutAwait(runInterval);
    }
})();
