const { loadScriptEnv } = require('../services/shared');
loadScriptEnv();

(async function () {
    try {
        await require('./migrate').main();
        await require('../data/add_genders').main();
        await require('../data/add_activity_types_venues').main();
        await require('../data/add_locations').main();
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
