const cacheService = require('../services/cache');
const { loadScriptEnv, isProdApp } = require('../services/shared');
const { keys: systemKeys } = require('../services/system');

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

            let tables = [
                'persons_movies',
                'persons_movie_genres',
                'movies_genres',
                'movies',
                'movie_genres',
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            //delete sync
            for (let k in systemKeys.sync.data.movies) {
                await knex('sync').where('sync_process', systemKeys.sync.data.movies[k]).delete();
            }

            let movie_keys = await cacheService.getKeysWithPrefix(`movie`);

            await cacheService.deleteKeys(movie_keys);

            let movie_section_keys = [
                cacheService.keys.movies,
                cacheService.keys.movie_genres,
                cacheService.keys.movies_new,
                cacheService.keys.movies_popular,
            ];

            await cacheService.deleteKeys(movie_section_keys);
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
