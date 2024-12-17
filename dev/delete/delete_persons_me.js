const cacheService = require('../../services/cache');
const db = require('../../services/db');
const { loadScriptEnv, isProdApp, timeNow } = require('../../services/shared');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: persons->me');

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
                'persons_login_tokens',
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
                'persons_sections',
                'persons_smoking',
                'persons_sports_leagues',
                'persons_sports_play',
                'persons_sports_teams',
                'persons_tv_genres',
                'persons_tv_shows',
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            await knex('persons')
                .update({
                    mode_id: null,
                    updated: timeNow()
                });

            let person_keys = await cacheService.getKeysWithPrefix(`persons`);

            await cacheService.deleteKeys(person_keys);
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
