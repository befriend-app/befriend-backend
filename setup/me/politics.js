const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log("Sync politics");

        let table_name = 'politics';
        let added = 0;
        let updated = 0;

        try {
            await cacheService.deleteKeys(cacheService.keys.politics);

            let conn = await dbService.conn();
            let endpoint = dataEndpoint('/politics');
            let response = await axios.get(endpoint);

            for(let item of response.data.items) {
                let existing = await conn(table_name)
                    .where('token', item.token)
                    .first();

                if(existing) {
                    if(item.updated > existing.updated) {
                        item.updated = timeNow();

                        await conn(table_name)
                            .where('token', item.token)
                            .update(item);
                        updated++;
                    }
                } else {
                    item.created = timeNow();
                    item.updated = timeNow();

                    await conn(table_name).insert(item);

                    added++;
                }
            }
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        console.log('Politics synced:', { added, updated });
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