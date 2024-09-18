const axios = require('axios');

const dbService = require('../services/db');

const {timeoutAwait, getLocalDate, loadScriptEnv, getURL, timeNow} = require("../services/shared");
const {homeDomains, loadAltDomains, cols, getNetworkSelf} = require("../services/network");

const runInterval = 3600 * 1000; //every hour

loadScriptEnv();

(async function() {
    let home_domains = await homeDomains();

    while(true) {
        console.log({
            sync_networks: getLocalDate()
        });

        try {
            let conn = await dbService.conn();

            let my_network = await getNetworkSelf();

            if(my_network) {
                for(let domain of home_domains) {
                    try {
                        let r = await axios.get(getURL(domain, `networks`));

                        if(r.data && r.data.networks) {
                            for(let network of r.data.networks) {
                                //do not do anything if network belongs to me
                                if(my_network.network_token === network.network_token) {
                                    continue;
                                }

                                let keys_exchanged = false;

                                //add to db if not exists
                                try {
                                    let db_qry = await conn('networks')
                                        .where('network_token', network.network_token)
                                        .first();

                                    if(!db_qry) {
                                        let network_insert = {};

                                        //prepare data insert based on networks table cols
                                        for(let col of cols) {
                                            if(col in network) {
                                                network_insert[col] = network[col];
                                            }
                                        }

                                        network_insert.is_self = false;
                                        network_insert.keys_exchanged = false;
                                        network_insert.created = timeNow();
                                        network_insert.updated = timeNow();

                                        await conn('networks')
                                            .insert(network_insert);
                                    } else {
                                        keys_exchanged = db_qry.keys_exchanged;
                                    }
                                } catch(e) {
                                    console.error(e);
                                }

                                //exchange keys if needed
                                if(!keys_exchanged) {
                                    //do not initiate process if my network was added after this network to prevent duplicate cross-send
                                    let my_network_created = null;
                                    let their_network_created = network.created;

                                    for(let _network of r.data.networks) {
                                        if(_network.network_token === my_network.network_token) {
                                            my_network_created = _network.created;
                                            break;
                                        }
                                    }

                                    if(my_network_created > their_network_created) {
                                        continue;
                                    }

                                    //way to know communicating with non-spoofed network

                                    //befriend_network_token
                                    let befriend_qry = await conn('networks')
                                        .where('')

                                    //self
                                    //sending_network_token

                                    //receiving_network_token
                                    //to_network_token

                                    //encrypt self_network_token with befriend_secret_key for to_network
                                    //decrypt encrypted self_network_token on to_network,
                                    // if value matches self_network_token, begin key exchange process
                                    debugger;
                                }
                            }

                            break;
                        }
                    } catch(e) {
                        console.error(e);
                    }
                }
            }
        } catch(e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();