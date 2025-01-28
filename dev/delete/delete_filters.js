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

            let gridLookup = await getGridLookup();

            let persons = await knex('persons')
                .select('id', 'person_token', 'grid_id');

            let bulk_delete_count = 50000;

            for (let i = 0; i < persons.length; i += bulk_delete_count) {
                let chunk = persons.slice(i, i + bulk_delete_count);

                let grids = {};

                for(let p of chunk) {
                    let grid = gridLookup.byId[p.grid_id];

                    if(grid) {
                        grids[grid.token] = true;
                    }
                }

                let pipeline = cacheService.startPipeline();

                //clean up grid sets
                for(let grid in grids) {
                    let sorted_keys = await cacheService.getKeysWithPrefix(cacheService.keys.persons_grid_sorted(grid, ''));
                    let set_keys = await cacheService.getKeysWithPrefix(cacheService.keys.persons_grid_set(grid, ''));
                    let exclude_keys = await cacheService.getKeysWithPrefix(`persons:grid:${grid}:exclude`);
                    let send_receive = await cacheService.getKeysWithPrefix(cacheService.keys.persons_grid_send_receive(grid, 'verifications'));
                    let srem_keys = set_keys.concat(exclude_keys).concat(send_receive);

                    let grid_rest_keys = await cacheService.getKeysWithPrefix(`persons:grid:${grid}`);

                    for(let key of sorted_keys) {
                        pipeline.del(key);
                    }

                    for(let key of srem_keys) {
                        pipeline.del(key);
                    }

                    for(let key of grid_rest_keys) {
                        if(!(sorted_keys.includes(key))) {
                            pipeline.del(key);
                        }
                    }
                }

                await cacheService.execPipeline(pipeline);
            }

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
