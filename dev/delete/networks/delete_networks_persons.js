const { loadScriptEnv, isProdApp } = require('../../../services/shared');
const { keys: systemKeys } = require('../../../services/system');
const { getKeysWithPrefix, deleteKeys } = require('../../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: networks->persons');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            return resolve();
        }

        let dbs = [process.env.DB_NAME, 'befriend-4001', 'befriend-4002'];

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
                .whereNot('network_id', network_self.id)
                .select('id');

            let tables = [
                'persons_networks',
                'persons',
            ];

            for (let i = 0; i < persons.length; i += bulk_delete_count) {
                let chunk = persons.slice(i, i + bulk_delete_count);

                let ids = chunk.map(x => x.id);

                await knex('persons_networks').whereIn('person_id', ids).delete();


            }

            for (let table of tables) {
                while (true) {
                    try {
                        var pn_qry = await knex(table).select('id').limit(bulk_delete_count);
                    } catch (e) {
                        break;
                    }

                    if (!pn_qry.length) {
                        break;
                    } else {
                        let ids = pn_qry.map((x) => x.id);

                        await knex(table).whereIn('id', ids).delete();
                    }
                }
            }

            try {
                await knex('sync').where('sync_process', systemKeys.sync.network.persons).delete();
            } catch (e) {
                console.error(e);
            }
        }

        let keys = await getKeysWithPrefix(`persons:`);

        await deleteKeys(keys);

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
