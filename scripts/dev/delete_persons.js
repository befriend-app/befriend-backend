const db = require("../../services/db");
const { loadScriptEnv } = require("../../services/shared");

loadScriptEnv();

(async function () {
    let dbs = [process.env.DB_NAME, "befriend-4001", "befriend-4002"];

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

        let knex = require("knex")({
            client: process.env.DB_CLIENT,
            connection: connection,
        });

        let bulk_delete_count = 50000;

        while (true) {
            let pn_qry = await knex("persons_networks").select("id").limit(bulk_delete_count);

            if (!pn_qry.length) {
                break;
            } else {
                let ids = pn_qry.map((x) => x.id);

                await knex("persons_networks").whereIn("id", ids).delete();
            }
        }

        while (true) {
            let p_qry = await knex("persons").select("id").limit(bulk_delete_count);

            if (!p_qry.length) {
                break;
            } else {
                let ids = p_qry.map((x) => x.id);

                await knex("persons").whereIn("id", ids).delete();
            }
        }

        await knex("sync").where("sync_process", "persons").delete();
    }

    process.exit();
})();
