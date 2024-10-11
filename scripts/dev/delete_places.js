const cacheService = require('../../services/cache');
const db = require('../../services/db');
const {loadScriptEnv} = require("../../services/shared");

loadScriptEnv();

(async function() {
    await cacheService.init();

    let dbs = [process.env.DB_NAME];

    for (let db of dbs) {
        let connection = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: db
        };

        if(process.env.DB_PORT) {
            connection.port = parseInt(process.env.DB_PORT);
        }

        let knex = require('knex')({
            client: process.env.DB_CLIENT,
            connection: connection
        });

        await knex('categories_geo_places')
            .delete();

        await knex('categories_geo')
            .delete();

        await knex('places')
            .delete();

        let keys = await cacheService.getKeys(`place:fsq*`);

        if(keys.length > 0) {
            await cacheService.deleteKeys(keys);
        }
    }

    process.exit();
})();