const cacheService = require('../../services/cache');
const db = require('../../services/db');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

(async function () {
    if (isProdApp()) {
        console.error('App env: [prod]', 'exiting');
        process.exit();
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
            'persons_sections',
            'me_sections'
        ];

        for(let table of tables) {
            await knex(table).delete();
        }

        let keys = await cacheService.getKeys(`${cacheService.keys.person_sections('')}*`);

        keys.push(cacheService.keys.me_sections);

        await cacheService.deleteKeys(keys);

        await require('../../data/me_sections/add_sections').main();
    }

    process.exit();
})();
