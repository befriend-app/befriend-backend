const cacheService = require('../../services/cache');
const db = require('../../services/db');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: tv');

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
                'persons_tv_shows',
                'persons_tv_genres',
                'tv_shows_genres',
                'tv_shows',
                'tv_genres',
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            //delete sync
            for (let k in systemKeys.sync.data.tv) {
                await knex('sync').where('sync_process', systemKeys.sync.data.tv[k]).delete();
            }

            //delete cache data
            let tv_keys = await cacheService.getKeysWithPrefix(`tv:`);

            await cacheService.deleteKeys(tv_keys);

            let tv_section_keys = [
                cacheService.keys.tv_shows,
                cacheService.keys.tv_genres,
                cacheService.keys.tv_popular,
            ];

            await cacheService.deleteKeys(tv_section_keys);
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
