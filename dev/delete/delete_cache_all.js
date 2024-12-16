const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { getKeys } = require('../../services/cache');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: cache:all');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            process.exit();
        }

        await cacheService.init();

        let keys = cacheService.keys;

        for (let key in keys) {
            if (typeof keys[key] === 'function') {
                let cache_key = keys[key]('', '');

                if (cache_key.includes('::')) {
                    cache_key = cache_key.split('::')[0] + ':';
                }

                console.log({
                    deleting_key: cache_key,
                });

                const key_keys = await getKeys(cache_key + '*');

                await cacheService.deleteKeys(key_keys);
            }
        }

        let remaining_keys = await getKeys('*');

        await cacheService.deleteKeys(remaining_keys);

        process.exit();
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
