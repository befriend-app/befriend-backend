const cacheService = require('../../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../../services/shared');
const { keys: systemKeys } = require('../../../services/system');
const { getGridLookup } = require('../../../services/grid');

let syncMe = require('../../../services/networks/me');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: networks->me');

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

            let network_self = await knex('networks')
                .where('is_self', true)
                .first();

            let bulk_delete_count = 50000;

            let persons = await knex('persons')
                .whereNot('registration_network_id', network_self.id)
                .select('id', 'person_token', 'grid_id');

            let gridLookup = await getGridLookup();

            for (let i = 0; i < persons.length; i += bulk_delete_count) {
                let chunk = persons.slice(i, i + bulk_delete_count);

                let ids = chunk.map(x => x.id);
                let tokens = chunk.map(x => x.person_token);
                let grids = {};

                for(let p of chunk) {
                    let grid = gridLookup.byId[p.grid_id];

                    if(grid) {
                        grids[grid.token] = true;
                    }
                }

                for(let table of syncMe.tables) {
                    await knex(table)
                        .whereIn('person_id', ids)
                        .delete();
                }

                await knex('persons_sections')
                    .whereIn('person_id', ids)
                    .delete();
            }

            try {
                await knex('sync').where('sync_process', systemKeys.sync.network.persons_me).delete();
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
