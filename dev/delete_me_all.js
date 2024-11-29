const cacheService = require('../services/cache');
const { loadScriptEnv, isProdApp } = require('../services/shared');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: all/me');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await cacheService.init();

        let scripts = ['delete_sports', 'delete_music', 'delete_schools', 'delete_movies', 'delete_tv', 'delete_instruments', 'delete_me'];

        for (let s of scripts) {
            await require(`./${s}`).main();
        }

        if (is_me) {
            process.exit();
        }

        resolve();
    });
}

module.exports = {
    main: main,
};

if (require.main === module) {
    (async function () {
        try {
            await main(true);
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
