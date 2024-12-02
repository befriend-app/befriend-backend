const cacheService = require('../services/cache');
const { loadScriptEnv, isProdApp } = require('../services/shared');
const { keys: systemKeys } = require('../services/system');
const { getKeys } = require('../services/cache');

loadScriptEnv();

async function deleteDb() {
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
        let db_sync_keys = [
            systemKeys.sync.data.music.artists_genres,
            systemKeys.sync.data.music.artists,
        ];

        for (let key of db_sync_keys) {
            try {
                await knex('sync').where('sync_process', key).delete();
            } catch (e) {
                console.error(e);
            }
        }

        let tables = [
            'persons_music_artists',
            'persons_music_genres',
            'music_artists_genres',
            'music_artists',
            'music_genres_countries',
            'music_genres',
        ];

        for (let table of tables) {
            try {
                await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
                await knex(table).delete();
            } finally {
                await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
            }
        }
    }
}

async function deleteRedis() {
    await cacheService.init();

    let keys = await getKeys('music:*');

    console.log({
        keys: keys.length,
    });

    await cacheService.deleteKeys(keys);

    let music_section_keys = [
        cacheService.keys.music_artists,
        cacheService.keys.music_genres,
    ];

    await cacheService.deleteKeys(music_section_keys);
}

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: music');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await deleteDb();
        await deleteRedis();

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
