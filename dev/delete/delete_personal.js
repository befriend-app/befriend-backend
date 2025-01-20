const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { keys: systemKeys } = require('../../services/system');
const { getKeys } = require('../../services/cache');

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

        let tables = [
            'life_stages',
            'relationship_status',
            'languages_countries_top',
            'languages',
            'politics',
            'religions',
            'drinking',
            'smoking'
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

    let keys = [cacheService.keys.life_stages, cacheService.keys.relationship_status,
        cacheService.keys.languages, cacheService.keys.politics, cacheService.keys.religions,
        cacheService.keys.drinking, cacheService.keys.smoking
    ];

    let languages_countries_keys = await getKeys(cacheService.keys.languages_country(''));

    await cacheService.deleteKeys(keys.concat(languages_countries_keys));
}

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: personal');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        await deleteDb();
        await deleteRedis();

        resolve();
    });
}

module.exports = {
    main: main,
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
