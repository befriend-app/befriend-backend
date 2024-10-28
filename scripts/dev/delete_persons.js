const db = require('../../services/db');
const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

(async function () {
    if(isProdApp()) {
        console.error("App env: [prod]", 'exiting');
        process.exit();
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
        let activity_tables = ['activities_persons', 'activities_filters', 'activities', 'persons_login_tokens', 'persons_devices', 'persons_networks', 'persons'];

        for(let activity_table of activity_tables) {
            while (true) {
                let pn_qry = await knex(activity_table).select('id').limit(bulk_delete_count);

                if (!pn_qry.length) {
                    break;
                } else {
                    let ids = pn_qry.map((x) => x.id);

                    await knex(activity_table).whereIn('id', ids).delete();
                }
            }
        }

        try {
            await knex('sync').where('sync_process', 'persons').delete();
        } catch(e) {
            console.error(e);
        }
    }

    process.exit();
})();
