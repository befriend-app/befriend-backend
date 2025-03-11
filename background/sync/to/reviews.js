//this sync process sends reviews created on your server

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

const UPDATE_FREQUENCY = 60 * 10 * 1000; //runs every 10 minutes
const BATCH_SIZE = 1000;

let self_network;

function processUpdate() {
    return new Promise(async (resolve, reject) => {
        resolve();
    });
}

async function main() {
    await cacheService.init();

    try {
        self_network = await getNetworkSelf();

        if (!self_network) {
            throw new Error();
        }

        if (self_network.is_befriend) {
            return;
        }
    } catch (e) {
        console.error('Error getting own network', e);
        await timeoutAwait(5000);
        process.exit();
    }

    await processUpdate();

    setInterval(processUpdate, UPDATE_FREQUENCY);
}

module.exports = {
    main,
};

if (require.main === module) {
    (async function () {
        try {
            await main();
        } catch (e) {
            console.error(e);
        }
    })();
}
