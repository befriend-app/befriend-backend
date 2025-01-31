const networksSync = require('./networks');
const networksPersonsSync = require('./networks_persons');
const personsSync = require('./persons');
const meSync = require('./me');
const filtersSync = require('./filters');

const {
    loadScriptEnv,
    timeoutAwait,
} = require('../../services/shared');

const runInterval = 60 * 30 * 1000; //every 30 minutes

(async function () {
    loadScriptEnv();

    while (true) {
        try {
            await networksSync.main();
            await networksPersonsSync.main();
            await personsSync.main();
            await meSync.main();
            await filtersSync.main();
        } catch(e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();
