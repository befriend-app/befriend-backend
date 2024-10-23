const axios = require('axios');

const cacheService = require('../services/cache');
const dbService = require('../services/db');

const {
    timeoutAwait,
    getLocalDate,
    loadScriptEnv,
    getURL,
    timeNow,
    generateToken,
} = require('../services/shared');

const { homeDomains, cols, getNetworkSelf } = require('../services/network');

const runInterval = 3600 * 1000; //every hour

loadScriptEnv();

(async function () {
    let home_domains = await homeDomains();

    while (true) {
        console.log({
            sync_networks: getLocalDate(),
        });

        try {
            let conn = await dbService.conn();

            let my_network = await getNetworkSelf();

            let all_networks_qry = await conn('networks');

            let all_networks_dict = {};

            for (let network of all_networks_qry) {
                all_networks_dict[network.network_token] = network;
            }

            if (my_network) {
                let is_network_data_received = false;

                for (let domain of home_domains) {
                    if (is_network_data_received) {
                        break;
                    }

                    try {
                        let r = await axios.get(getURL(domain, `networks`));

                        if (r.data && r.data.networks) {
                            is_network_data_received = true;

                            for (let network of r.data.networks) {
                                //do not do anything if network belongs to me
                                if (my_network.network_token === network.network_token) {
                                    continue;
                                }

                                let keys_exchanged = false;

                                let registering_network =
                                    all_networks_dict[network.registration_network_token];

                                //registering network required for keys exchange
                                if (!registering_network) {
                                    continue;
                                }

                                //add network to db if not exists
                                try {
                                    if (!(network.network_token in all_networks_dict)) {
                                        let network_insert = {};

                                        //prepare data insert based on networks table cols
                                        for (let col of cols) {
                                            if (col in network) {
                                                network_insert[col] = network[col];
                                            }
                                        }

                                        network_insert.registration_network_id =
                                            registering_network.id;
                                        network_insert.is_self = false;
                                        network_insert.keys_exchanged = false;
                                        network_insert.created = timeNow();
                                        network_insert.updated = timeNow();

                                        let id = await conn('networks').insert(network_insert);

                                        network_insert.id = id[0];

                                        all_networks_dict[network.network_token] = network_insert;
                                    } else {
                                        keys_exchanged =
                                            all_networks_dict[network.network_token].keys_exchanged;
                                    }
                                } catch (e) {
                                    console.error(e);
                                }

                                //exchange keys if needed
                                if (!keys_exchanged) {
                                    //do not initiate process if my network was added after this network to prevent duplicate cross-send
                                    let my_network_created = null;
                                    let their_network_created = network.created;

                                    for (let _network of r.data.networks) {
                                        if (_network.network_token === my_network.network_token) {
                                            my_network_created = _network.created;
                                            break;
                                        }
                                    }

                                    if (my_network_created > their_network_created) {
                                        continue;
                                    }

                                    //way to know communicating with non-spoofed network
                                    //unique token to start process
                                    let keys_exchange_token = generateToken(40);

                                    let cache_key =
                                        cacheService.keys.exchange_keys(keys_exchange_token);

                                    //save cache key with value of to_network_token to auth/validate request in /keys/exchange/save
                                    await cacheService.setCache(cache_key, network.network_token);

                                    //registration_network_token
                                    //self
                                    //sending_network_token

                                    //receiving_network_token
                                    //to_network_token

                                    //encrypt self_network_token with befriend_secret_key for to_network
                                    //decrypt encrypted self_network_token on to_network,
                                    // if value matches self_network_token, begin key exchange process

                                    let r2 = await axios.post(
                                        getURL(
                                            registering_network.api_domain,
                                            `keys/exchange/encrypt`,
                                        ),
                                        {
                                            exchange_token: keys_exchange_token,
                                            network_tokens: {
                                                from: my_network.network_token,
                                                to: network.network_token,
                                            },
                                        },
                                    );
                                }
                            }

                            break;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();
