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

            await knex('persons_networks')
                .whereNot('network_id', network_self.id)
                .delete();

            let persons = await knex('persons')
                .whereNot('network_id', network_self.id)
                .select('id');

            for (let i = 0; i < persons.length; i += bulk_delete_count) {
                let chunk = persons.slice(i, i + bulk_delete_count);

                let ids = chunk.map(x => x.id);

                await knex('persons').whereIn('id', ids).delete();
            }

            try {
                await knex('sync').where('sync_process', systemKeys.sync.network.persons).delete();
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
