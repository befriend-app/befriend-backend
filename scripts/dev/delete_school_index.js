const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

(async function () {
    if (isProdApp()) {
        console.error('App env: [prod]', 'exiting');
        process.exit();
    }

    await cacheService.init();

    let keys = await cacheService.getKeys(`schools:country:*`);

    await cacheService.deleteKeys(keys);

    await require('../../data/me_sections/index_schools').main();

    process.exit();
})();
