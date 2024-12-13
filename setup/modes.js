const axios = require('axios');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { loadScriptEnv, dataEndpoint, timeNow } = require('../services/shared');
const { deleteKeys, keys } = require('../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add modes');

        let table_name = 'modes';

        try {
            let now = timeNow();

            let conn = await dbService.conn();

            let modes = [
                {
                    token: 'solo',
                    name: 'Solo',
                    sort_position: 1,
                    created: now,
                    updated: now,
                },
                {
                    token: 'partner',
                    name: 'Partner',
                    sort_position: 2,
                    created: now,
                    updated: now,
                },
                {
                    token: 'kids',
                    name: 'Kids',
                    sort_position: 3,
                    created: now,
                    updated: now,
                },
            ];

            for (let mode of modes) {
                let qry = await conn(table_name).where('token', mode.token).first();

                if (!qry) {
                    await conn(table_name).insert(mode);
                }
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        await deleteKeys(cacheService.keys.modes);

        console.log('modes added');

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
