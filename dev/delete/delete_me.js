const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: me');

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
                'persons_drinking',
                'persons_industries',
                'persons_instruments',
                'persons_kids',
                'persons_languages',
                'persons_life_stages',
                'persons_movie_genres',
                'persons_movies',
                'persons_music_artists',
                'persons_music_genres',
                'persons_partner',
                'persons_politics',
                'persons_relationship_status',
                'persons_religions',
                'persons_roles',
                'persons_schools',
                'persons_smoking',
                'persons_sports_leagues',
                'persons_sports_play',
                'persons_sports_teams',
                'persons_tv_genres',
                'persons_tv_shows',
                'persons_sections',
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            let keys = await cacheService.getKeysWithPrefix(`persons:me`);

            await cacheService.deleteKeys(keys);

            try {
                await knex('sync')
                    .where('sync_process', systemKeys.sync.network.persons_me)
                    .delete();
            } catch (e) {
                console.error(e);
            }
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
