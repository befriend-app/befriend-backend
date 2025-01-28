const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: grid sets');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await cacheService.init();

        let grid_keys = await cacheService.getKeysWithPrefix(`persons:grid`);

        await cacheService.deleteKeys(grid_keys);

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