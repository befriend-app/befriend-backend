const cacheService = require('../services/cache');
const db = require('../services/db');
const { loadScriptEnv, isProdApp } = require('../services/shared');
const { keys: systemKeys } = require('../services/system');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: filters');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await cacheService.init();

        let dbs = [process.env.DB_NAME];

        for (let db of dbs) {
            let connection = {
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: db,
            };

            if (process.env.DB_PORT) {
                connection.port = parseInt(process.env.DB_PORT);
            }

            let knex = require('knex')({
                client: process.env.DB_CLIENT,
                connection: connection,
            });

            let tables = [
                'persons_filters',
                'activities_filters'
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            //delete cache data
            let keys = await cacheService.getKeysWithPrefix(`persons:filters`);

            await cacheService.deleteKeys(keys);
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
