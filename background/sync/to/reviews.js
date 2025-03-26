//this sync process sends reviews created on 3rd party network to befriend home network

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');
const { timeNow, loadScriptEnv, timeoutAwait, getURL } = require('../../../services/shared');
const {
    getNetworkSelf,
    homeDomains,
    getNetworksLookup,
    getSecretKeyToForNetwork,
} = require('../../../services/network');
const axios = require('axios');

loadScriptEnv();

let self_network;

function syncReviews() {
    return new Promise(async (resolve, reject) => {
        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            self_network = await getNetworkSelf();

            if (!self_network) {
                return reject();
            }

            if (self_network.is_befriend) {
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
