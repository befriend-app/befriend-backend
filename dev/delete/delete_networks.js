const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { keys, deleteKeys } = require('../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: networks');

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

            let bulk_delete_count = 50000;

            //delete activities
            let tables = [
                'persons_filters_networks',
                'networks_persons',
                'networks_secret_keys',
                'networks',
            ];

            await knex('networks').update({
                registration_network_id: null,
            });

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
        }

        await deleteKeys([keys.networks, keys.networks_filters]);

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
