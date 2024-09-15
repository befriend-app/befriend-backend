const axios = require('axios');

const dbService = require('../services/db');

const {timeoutAwait, getLocalDate, loadScriptEnv, getURL, timeNow} = require("../services/shared");
const {homeDomains, loadAltDomains, cols} = require("../services/network");

const runInterval = 3600 * 60 * 1000; //every hour

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