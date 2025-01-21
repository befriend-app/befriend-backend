const personsSync = require('./persons');
const meSync = require('./me');

const {
    loadScriptEnv,
    timeoutAwait,
} = require('../../services/shared');

const runInterval = 60 * 30 * 1000; //every 30 minutes

(async function () {
    loadScriptEnv();

    while (true) {
        try {
            await personsSync.main();
            await meSync.main();
        } catch(e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();
