const cache = require('../services/cache');
const db = require('../services/db');
const { loadScriptEnv, isProdApp } = require('../services/shared');
const cacheService = require('../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log("Delete: activity types");

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

            await knex('activities_persons').delete();
            await knex('activities_filters').delete();
            await knex('activities').delete();

            await knex('activity_type_venues').delete();

            let ids = await knex('activity_types');

            while (true) {
                for (let id of ids) {
                    try {
                        await knex('activity_types').where('id', id.id).delete();
                    } catch (e) {}
                }

                let count = await knex('activity_types');

                if (!count.length) {
                    break;
                }
            }

            ids = await knex('venues_categories');

            while (true) {
                for (let id of ids) {
                    try {
                        await knex('venues_categories').where('id', id.id).delete();
                    } catch (e) {}
                }

                let count = await knex('venues_categories');

                if (!count.length) {
                    break;
                }
            }
        }

        //delete cache
        await cacheService.deleteKeys(cacheService.keys.activity_types);

        await cacheService.deleteKeys(await (cacheService.getKeysWithPrefix(cacheService.keys.activity_type(''))));

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
