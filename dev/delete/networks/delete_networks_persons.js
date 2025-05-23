const cacheService = require('../../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../../services/shared');
const { keys: systemKeys } = require('../../../system');

let syncMe = require('../../../services/networks/me');
const { getGridById } = require('../../../services/grid');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: networks->persons');

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

            await require('./delete_networks_filters').main();
            await require('./delete_networks_me').main();

            let network_self = await knex('networks').where('is_self', true).first();

            let bulk_delete_count = 50000;

            let persons = await knex('persons')
                .whereNot('registration_network_id', network_self.id)
                .select('id', 'person_token', 'grid_id');

            for (let i = 0; i < persons.length; i += bulk_delete_count) {
                let chunk = persons.slice(i, i + bulk_delete_count);

                let ids = chunk.map((x) => x.id);
                let tokens = chunk.map((x) => x.person_token);
                let grids = {};

                for (let p of chunk) {
                    let grid = await getGridById(p.grid_id);

                    if (grid) {
                        grids[grid.token] = true;
                    }
                }

                for (let table of syncMe.tables) {
                    await knex(table).whereIn('person_id', ids).delete();
                }

                await knex('persons_sections').whereIn('person_id', ids).delete();

                await knex('persons_partner').whereIn('person_id', ids).delete();

                await knex('persons_kids').whereIn('person_id', ids).delete();

                await knex('activities_persons').whereIn('person_id', ids).delete();

                await knex('activities_persons_reviews')
                    .whereIn('person_from_id', ids)
                    .orWhereIn('person_to_id', ids)
                    .delete();

                await knex('activities_notifications').whereIn('person_to_id', ids).delete();

                await knex('activities_notifications').whereIn('person_from_id', ids).delete();

                await knex('activities').whereIn('person_id', ids).delete();

                let pipeline = cacheService.startPipeline();

                //clean up grid sets
                for (let grid in grids) {
                    let sorted_keys = await cacheService.getKeysWithPrefix(
                        cacheService.keys.persons_grid_sorted(grid, ''),
                    );
                    let set_keys = await cacheService.getKeysWithPrefix(
                        cacheService.keys.persons_grid_set(grid, ''),
                    );
                    let exclude_keys = await cacheService.getKeysWithPrefix(
                        `persons:grid:${grid}:exclude`,
                    );
                    let send_receive = await cacheService.getKeysWithPrefix(
                        cacheService.keys.persons_grid_send_receive(grid, 'verifications'),
                    );
                    let srem_keys = set_keys.concat(exclude_keys).concat(send_receive);

                    let grid_rest_keys = await cacheService.getKeysWithPrefix(
                        `persons:grid:${grid}`,
                    );

                    for (let token of tokens) {
                        for (let key of sorted_keys) {
                            pipeline.zRem(key, token);
                        }

                        for (let key of srem_keys) {
                            pipeline.sRem(key, token);
                        }

                        for (let key of grid_rest_keys) {
                            if (!sorted_keys.includes(key)) {
                                pipeline.sRem(key, token);
                            }
                        }
                    }
                }

                for (let token of tokens) {
                    pipeline.del(cacheService.keys.activities(token));
                    pipeline.del(cacheService.keys.person(token));
                    pipeline.del(cacheService.keys.persons_activities(token));
                    pipeline.del(cacheService.keys.person_filters(token));
                    pipeline.del(cacheService.keys.person_sections(token));
                }

                await cacheService.execPipeline(pipeline);
            }

            try {
                await knex('sync').where('sync_process', systemKeys.sync.network.persons).delete();
                await knex('sync')
                    .where('sync_process', systemKeys.sync.network.persons_modes)
                    .delete();
                await knex('sync')
                    .where('sync_process', systemKeys.sync.network.persons_me)
                    .delete();
                await knex('sync')
                    .where('sync_process', systemKeys.sync.network.persons_filters)
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
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
