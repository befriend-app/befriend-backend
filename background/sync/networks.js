const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const {
    timeoutAwait,
    getLocalDate,
    loadScriptEnv,
    getURL,
    timeNow,
    generateToken,
} = require('../../services/shared');

const { homeDomains, cols, getNetworkSelf } = require('../../services/network');
const { deleteKeys } = require('../../services/cache');

function main() {
    console.log("Sync: networks");

    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        let my_network;

        try {
            my_network = await getNetworkSelf();

            if (!my_network) {
                throw new Error();
            }
        } catch (e) {
            console.error('Error getting own network', e);
            await timeoutAwait(5000);
            process.exit();
        }

        //self->server needs to be running
        try {
            let self_ping_url = getURL(my_network.api_domain, `happy-connect`);

            let r = await axios.get(self_ping_url);

            if (!('happiness' in r.data)) {
                throw new Error();
            }
        } catch (e) {
            console.error('Server not running, exiting');
            console.error('Start server: `node servers');
            await timeoutAwait(5000);
            process.exit();
        }

        let home_domains = await homeDomains();

        console.log({
            sync_networks: getLocalDate(),
        });

        try {
            let needsCacheReset = false;

            let conn = await dbService.conn();

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

                        if (r.data?.networks) {
                            is_network_data_received = true;

                            for (let network of r.data.networks) {
                                //do not do anything if is my network
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
                                    let existing_network = all_networks_dict[network.network_token];

                                    if (!existing_network) {
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

                                        needsCacheReset = true;

                                        network_insert.id = id[0];

                                        all_networks_dict[network.network_token] = network_insert;
                                    } else {
                                        //set if keys already exchanged for existing network
                                        keys_exchanged =
                                            all_networks_dict[network.network_token].keys_exchanged;

                                        //update if any new data
                                        let network_update = {};

                                        for (let col of cols) {
                                            if (
                                                typeof network[col] !== 'undefined' &&
                                                network[col] !== existing_network[col]
                                            ) {
                                                network_update[col] = network[col];
                                            }
                                        }

                                        if (Object.keys(network_update).length) {
                                            network_update.updated = timeNow();

                                            await conn('networks')
                                                .where('id', existing_network.id)
                                                .update(network_update);

                                            needsCacheReset = true;
                                        }
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

            if (needsCacheReset) {
                //delete networks cache data on add/update
                await deleteKeys([cacheService.keys.networks, cacheService.keys.networks_filters]);
            }
        } catch (e) {
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
