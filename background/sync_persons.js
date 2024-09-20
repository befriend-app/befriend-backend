const axios = require('axios');

const dbService = require('../services/db');

const {loadScriptEnv, timeoutAwait, timeNow, getURL, joinPaths} = require("../services/shared");
const {getNetworkSelf} = require("../services/network");
const {setCache} = require("../services/cache");
const {encrypt} = require("../services/encryption");

const sync_name = `persons`;

const runInterval = 60 * 30 * 1000; //every 30 minutes

function processPersons(network_id, persons) {
    return new Promise(async (resolve, reject) => {
        if(!persons || !persons.length) {
            return resolve();
        }
    });
}

(async function() {
    loadScriptEnv();

    while(true) {
        try {
            let conn = await dbService.conn();

            let network_self = await getNetworkSelf();

            //networks to sync data with
            //networks can be updated through the sync_networks background process
            let networks = await conn('networks')
                .where('is_self', false)
                .where('is_blocked', false)
                .where('is_online', true)
                .where('keys_exchanged', true);

            for(let network of networks) {
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
                    since: timestamps.last,
                    network_token: network_self.network_token,
                    encrypted_network_token: encrypted_network_token,
                });

                await processPersons(network.id, response.data.persons);

                //handle paging, ~10,000 results
                while (response.data.last_person_token) {
                    try {
                        response = await axios.post(sync_url, {
                            request_sent: timeNow(),
                            data_since: timestamps.last,
                            network_token: network_self.network_token,
                            encrypted_network_token: encrypted_network_token,
                            last_person_token: response.data.last_person_token
                        });

                        await processPersons(network.id, response.data.persons);
                    } catch(e) {
                        console.error(e);
                        break;
                    }
                }
            }
        } catch(e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();