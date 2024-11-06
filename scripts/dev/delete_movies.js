const cacheService = require('../../services/cache');
const db = require('../../services/db');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: movies');

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

            let tables = ['persons_movies', 'movies'];

            for (let table of tables) {
                await knex(table).delete();
            }

            let keys = await cacheService.getKeys(`${cacheService.keys.movie('')}*`);

            let keys_2 = await cacheService.getKeys(`${cacheService.keys.movies_prefix('')}*`);

            keys = keys.concat(keys_2);

            await cacheService.deleteKeys(keys);
        }

        if (is_me) {
            await require('../../data/me_sections/add_movies').main();

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
