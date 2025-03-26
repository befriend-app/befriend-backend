//this sync process sends reviews created on 3rd party network to befriend home network

const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');
const { timeNow, loadScriptEnv, timeoutAwait, getURL } = require('../../../services/shared');
const {
    getNetworkSelf,
    homeDomains,
    getNetworksLookup,
    getSecretKeyToForNetwork, getNetworkWithSecretKeyByDomain,
} = require('../../../services/network');
const { keys: systemKeys, getNetworkSyncProcess } = require('../../../system');


loadScriptEnv();

let debug_sync_enabled = require('../../../dev/debug').sync.reviews;

let networkSelf;

function syncReviews() {
    console.log("Sync: reviews");

    const sync_name = systemKeys.sync.network.reviews;

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let domains = await homeDomains();

            for (let domain of domains) {
                try {
                    let network = await getNetworkWithSecretKeyByDomain(domain);

                    if (!network) {
                        continue;
                    }

                    let skipSaveTimestamps = false;
                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let last_sync = await getNetworkSyncProcess(sync_name, network.id);

                    if (last_sync && !debug_sync_enabled) {
                        timestamps.last = last_sync.last_updated;
                    }

                    let reviews = await conn('activities_persons_reviews')
                        .where(function() {
                            this.where('is_synced', 0)
                                .orWhere('updated', '>', timestamps.last || 0);
                        });
                } catch (e) {
                    console.error(e);
                }
            }
        } catch(e) {

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

            await syncReviews();

            resolve();
        } catch (e) {
            console.error('Error getting own network', e);
            return reject();
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
