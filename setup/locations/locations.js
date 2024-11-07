const axios = require('axios');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { loadScriptEnv } = require('../../services/shared');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Loading locations');

            await require('./index_locations').main();

            console.log('Locations loaded');
        } catch (e) {
            console.error(e);
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
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
