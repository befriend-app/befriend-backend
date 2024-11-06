const db = require('../../services/db');
const cache = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: locations');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await cache.init();

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

            //delete db
            let tables = ['open_cities', 'open_states', 'open_countries'];

            for (let t of tables) {
                await knex(t).delete();
            }

            //delete cache
            let batchSize = 50000;

            let param_keys = [
                cache.keys.city(''),
                cache.keys.cities_prefix(''),
                cache.keys.state(''),
                cache.keys.country(''),
                cache.keys.cities_country(''),
            ];

            for (let key of param_keys) {
                let param_key = key + '*';

                let keys = await cache.getKeys(param_key + '*');

                for (let i = 0; i < keys.length; i += batchSize) {
                    const batch = keys.slice(i, i + batchSize);

                    await cache.deleteKeys(batch);
                }
            }

            await cache.deleteKeys([cache.keys.countries]);
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
