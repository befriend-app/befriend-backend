const axios = require('axios');

const dbService = require('../services/db');

const {timeoutAwait, getLocalDate, loadScriptEnv, getURL, timeNow} = require("../services/shared");
const {homeDomains, loadAltDomains, cols, getNetworkSelf} = require("../services/network");

const runInterval = 3600 * 1000; //every hour

loadScriptEnv();

(async function() {
    try {
        await loadAltDomains();
    } catch(e) {
        console.error(e);
        process.exit();
    }

    let home_domains = homeDomains();

    while (true) {
        console.log({
            sync_networks: getLocalDate()
        });

        let conn = await dbService.conn();

        try {
            let conn = await dbService.conn();

            let my_network = await getNetworkSelf();

            for(let domain of home_domains) {
                try {
                    let r = await axios.get(getURL(domain, `networks`));

                    if(r.data && r.data.networks) {
                        for(let network of r.data.networks) {
                            let keys_exchanged = false;

                            //add to db if not exists
                            try {
                                let db_qry = await conn('networks')
                                    .where('network_token', network.network_token)
                                    .first();

                                if(!db_qry) {
                                    let network_insert = {};

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
                                    }
                                }

                                if(my_network_created > their_network_created) {
                                    continue;
                                }

                                //way to know communicating with non-spoofed network
                                //befriend_network_token

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
        } catch(e) {

        }


        await timeoutAwait(runInterval);
    }
})();