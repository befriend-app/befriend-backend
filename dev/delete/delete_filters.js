const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { getFilters } = require('../../services/filters');
const { getGridLookup } = require('../../services/grid');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: filters');

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
                'persons_filters',
                'persons_availability',
                'persons_filters_networks',
                'activities_filters',
            ];

            for (let table of tables) {
                await knex(table).delete();
            }

            //delete cache data
            let keys = await cacheService.getKeysWithPrefix(`persons:filters`);

            await cacheService.deleteKeys(keys);

            await require('./delete_grid_sets').main();

            await knex('sync').where('sync_process', systemKeys.sync.network.persons_filters).delete();
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
