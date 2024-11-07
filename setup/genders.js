const axios = require('axios');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { loadScriptEnv } = require('../services/shared');

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add genders');

        let conn = await dbService.conn();

        console.log('Genders added');

        resolve();
    });
}

module.exports = {
    main: main,
};

//script executed directly
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
