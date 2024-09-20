const axios = require('axios');

const dbService = require('../services/db');
const genderService = require('../services/genders');

const {loadScriptEnv, timeoutAwait, timeNow, getURL, joinPaths, birthDatePure} = require("../services/shared");
const {getNetworkSelf} = require("../services/network");
const {setCache} = require("../services/cache");
const {encrypt} = require("../services/encryption");
const {getGender, getGenderByToken} = require("../services/genders");

const sync_name = `persons`;

const runInterval = 60 * 30 * 1000; //every 30 minutes

function processPersons(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if(!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            for(let person of persons) {
                let gender_id = null;

                if(person.gender) {
                    let gender = await getGenderByToken(person.gender.gender_token);

                    if(gender) {
                        gender_id = gender.id;
                    }
                }

                //de-duplicate
                let person_check = await conn('persons')
                    .where('person_token', person.person_token)
                    .first();

                //add to persons and persons_networks
                if(!person_check) {
                    let person_id = await conn('persons')
                        .insert({
                            person_token: person.person_token,
                            network_id: network_id,
                            gender_id: gender_id,
                            is_online: person.is_online,
                            reviews_count: person.reviews_count,
                            reviews_rating: person.reviews_rating,
                            birth_date: birthDatePure(person.birth_date),
                            created: timeNow(),
                            updated: timeNow()
                        });

                    person_id = person_id[0];

                    await conn('persons_networks')
                        .insert({
                            person_id: person_id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: person.updated
                        });
                } else {
                    //person could possibly already exist but joined with a new (second) network
                    let pn_check = await conn('persons_networks')
                        .where('person_id', person_check.id)
                        .where('network_id', network_id)
                        .first();

                    if(!pn_check) {
                        await conn('persons_networks')
                            .insert({
                                person_id: person_check.id,
                                network_id: network_id,
                                created: timeNow(),
                                updated: timeNow()
                            });
                    }

                    //update if updated changed
                    //updated col is set by network where data is retrieved from
                    if(person.updated > person_check.updated) {
                        await conn('persons')
                            .where('person_id', person_check.id)
                            .update({
                                gender_id: gender_id,
                                is_online: person.is_online,
                                reviews_count: person.reviews_count,
                                reviews_rating: person.reviews_rating,
                                birth_date: birthDatePure(person.birth_date),
                                updated: person.updated
                            });
                    }
                }
            }
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        return resolve();
    });
}

(async function() {
    loadScriptEnv();

    while(true) {
        let conn, network_self, networks;

        try {
            conn = await dbService.conn();

            network_self = await getNetworkSelf();

            //networks to sync data with
            //networks can be updated through the sync_networks background process
            networks = await conn('networks')
                .where('is_self', false)
                .where('is_blocked', false)
                .where('is_online', true)
                .where('keys_exchanged', true);
        } catch(e) {
            console.error(e);
        }

        if(networks) {
            for(let network of networks) {
                try {
                    //if error with one network, catch error and continue to next network
                    let timestamps = {
                        current: timeNow(),
                        last: null
                    };

                    //check for which data needed
                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if(sync_qry) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', sync_name));

                    //security_key
                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if(!secret_key_to_qry) {
                        continue;
                    }

                    let encrypted_network_token = await encrypt(secret_key_to_qry.secret_key_to, network_self.network_token);

                    let response = await axios.post(sync_url, {
                        request_sent: timeNow(),
                        data_since: timestamps.last,
                        network_token: network_self.network_token,
                        encrypted_network_token: encrypted_network_token,
                    });

                    if(response.status !== 202) {
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
                                last_person_token: response.data.last_person_token
                            });

                            if(response.status !== 202) {
                                break;
                            }

                            await processPersons(network.id, response.data.persons);
                        } catch(e) {
                            console.error(e);
                            break;
                        }
                    }

                    //update sync table
                    if(sync_qry) {
                        await conn('sync')
                            .where('id', sync_qry.id)
                            .update({
                                last_updated: timestamps.current,
                                updated: timeNow()
                            });
                    } else {
                        await conn('sync')
                            .insert({
                                sync_process: sync_name,
                                network_id: network.id,
                                last_updated: timestamps.current,
                                created: timeNow(),
                                updated: timeNow()
                            });
                    }
                } catch(e) {
                    console.error(e);
                }
            }
        }

        await timeoutAwait(runInterval);
    }
})();