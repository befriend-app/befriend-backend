const cacheService = require('../services/cache');
const { loadScriptEnv, isProdApp } = require('../services/shared');
const { keys: systemKeys } = require('../services/system');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: schools');

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

            //delete sync
            await knex('sync').where('sync_process', systemKeys.sync.data.schools).delete();

            let tables = ['persons_schools', 'schools'];

            for (let table of tables) {
                await knex(table).delete();
            }

            let keys = await cacheService.getKeys(`schools:*`);

            console.log({
                delete: keys.length,
            });

            await cacheService.deleteKeys(keys);
        }

        if (is_me) {
            await require('../setup/me/schools').main();

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
