const fromNetworks = require('./from/networks');
const fromNetworksPersons = require('./from/networks_persons');
const fromPersons = require('./from/persons');
const fromMe = require('./from/me');
const fromFilters = require('./from/filters');
const toUnknownPersons = require('./to/unknown_persons');

const { loadScriptEnv, timeoutAwait } = require('../../services/shared');

const runInterval = 60 * 30 * 1000; //every 30 minutes

(async function () {
    loadScriptEnv();

    while (true) {
        try {
            await fromNetworks.main();
            await fromNetworksPersons.main();
            await fromPersons.main();
            await fromMe.main();
            await fromFilters.main();
            await toUnknownPersons.main();
        } catch (e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();
