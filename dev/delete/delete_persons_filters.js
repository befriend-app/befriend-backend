const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp, timeNow } = require('../../services/shared');
const { deleteKeys } = require('../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: persons->filters');

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

            let tables = ['persons_filters_networks', 'persons_filters'];

            for (let table of tables) {
                try {
                    await knex(table).delete();
                } catch(e) {
                    console.error(e);
                }
            }

            let person_keys = await cacheService.getKeysWithPrefix(
                cacheService.keys.person_filters(''),
            );

            await deleteKeys(person_keys);
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
