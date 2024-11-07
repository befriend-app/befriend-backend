const { loadScriptEnv } = require('./services/shared');
loadScriptEnv();

(async function () {
    try {
        await require('./setup/migrate').main();
        await require('./setup/genders').main();
        await require('./setup/activity-types').main();
        await require('./setup/locations').main();
        await require('./setup/me').main();
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
