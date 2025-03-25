const fromNetworks = require('./from/networks');
const fromNetworksPersons = require('./from/networks_persons');
const fromPersons = require('./from/persons');
const fromMe = require('./from/me');
const fromFilters = require('./from/filters');
const toUnknownPersons = require('./to/unknown_persons');

const { loadScriptEnv, timeoutAwait } = require('../../services/shared');

const runInterval = 20 * 60 * 1000; //every x minutes

(async function () {
    loadScriptEnv();

    while (true) {
        try {
            await toUnknownPersons.main();
            await fromNetworks.main();
            await fromNetworksPersons.main();
            await fromPersons.main();
            await fromMe.main();
            await fromFilters.main();
        } catch (e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();
