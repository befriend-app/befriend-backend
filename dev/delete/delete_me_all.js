const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: me->all');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await cacheService.init();

        let scripts = [
            'delete_sports',
            'delete_music',
            'delete_schools',
            'delete_movies',
            'delete_tv',
            'delete_instruments',
            'delete_me',
        ];

        for (let s of scripts) {
            await require(`./${s}`).main();
        }

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

            let tables = ['me_sections'];

            for (let table of tables) {
                await knex(table).delete();
            }

            let keys = [];

            keys.push(cacheService.keys.me_sections);

            await cacheService.deleteKeys(keys);

            await cacheService.deleteKeys(Object.values(cacheService.keys.sectionKeys));

            await cacheService.deleteKeys(
                await cacheService.getKeysWithPrefix(cacheService.keys.languages_country('')),
            );
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
