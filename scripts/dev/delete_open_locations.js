const db = require("../../services/db");
const cache = require("../../services/cache");
const { loadScriptEnv } = require("../../services/shared");

loadScriptEnv();

(async function () {
    await cache.init();

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

        let knex = require("knex")({
            client: process.env.DB_CLIENT,
            connection: connection,
        });

        //delete db
        let tables = ["open_cities", "open_states", "open_countries"];

        for (let t of tables) {
            await knex(t).delete();
        }

        //delete cache
        let batchSize = 50000;

        let param_keys = [cache.keys.city, cache.keys.cities_prefix, cache.keys.state, cache.keys.country];

        for (let key of param_keys) {
            let param_key = key + "*";

            let keys = await cache.getKeys(param_key + "*");

            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);

                await cache.deleteKeys(batch);
            }
        }

        await cache.deleteKeys([cache.keys.cities_population]);
    }

    process.exit();
})();
