//in case 3rd-party network was unable to communicate with a befriend domain on user creation,
//this process ensures those persons are eventually known by the whole network

const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');
const { timeNow, loadScriptEnv, timeoutAwait, getURL } = require('../../../services/shared');
const {
    getNetworkSelf,
    homeDomains,
    getNetworksLookup,
    getSecretKeyToForNetwork,
} = require('../../../services/network');

loadScriptEnv();

let networkSelf;

const BATCH_SIZE = 1000;

function syncUnknownPersons() {
    return new Promise(async (resolve, reject) => {
        try {
            let t = timeNow();

            let conn = await dbService.conn();

            let hasMorePersons = true;
            let offset = 0;

            while (hasMorePersons) {
                try {
                    let persons = await conn('persons')
                        .where('is_person_known', false)
                        .where('registration_network_id', networkSelf.id)
                        .offset(offset)
                        .limit(BATCH_SIZE)
                        .select('id', 'person_token', 'updated');

                    if (!persons.length) {
                        hasMorePersons = false;
                    }

                    offset += BATCH_SIZE;

                    let home_domains = await homeDomains();
                    let networksLookup = await getNetworksLookup();

                    for (let domain of home_domains) {
                        //skip notifying own domain
                        if (networkSelf.api_domain.includes(domain)) {
                            continue;
                        }

                        let network_to = null;

                        for (let network of Object.values(networksLookup.byToken)) {
                            if (network.api_domain.includes(domain)) {
                                network_to = network;
                            }
                        }

                        if (!network_to) {
                            continue;
                        }

                        //security_key
                        let secret_key_to = await getSecretKeyToForNetwork(network_to.id);

                        if (!secret_key_to) {
                            continue;
                        }

                        let has_error = false;

                        for (let person of persons) {
                            try {
                                let r = await axios.post(getURL(domain, 'networks/persons'), {
                                    secret_key: secret_key_to,
                                    network_token: networkSelf.network_token,
                                    person_token: person.person_token,
                                    updated: person.updated,
                                });

                                if (r.status === 201) {
                                    await conn('persons')
                                        .where('id', person.id)
                                        .update({
                                            is_person_known: true,
                                            updated: timeNow(),
                                        });
                                } else {
                                    has_error = true;
                                }
                            } catch (e) {
                                has_error = true;
                                console.error(e);
                            }
                        }

                        if (!has_error) {
                            break;
                        }
                    }
                } catch (e) {
                    console.error(e);
                    hasMorePersons = false;
                }
            }

            console.log({
                total_time: timeNow() - t,
            });
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            networkSelf = await getNetworkSelf();

            if (!networkSelf) {
                return reject();
            }

            if (networkSelf.is_befriend) {
                return resolve();
            }

            await syncUnknownPersons();

            resolve();
        } catch (e) {
            console.error('Error getting own network', e);
            reject(e);
        }
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
