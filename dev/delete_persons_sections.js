const { loadScriptEnv, isProdApp } = require('../services/shared');
const { deleteKeys, getKeysWithPrefix } = require('../services/cache');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: persons');

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

            //delete activities
            let tables = [
                'persons_sections',
            ];

            for(let table of tables) {
                try {
                    await knex('persons_sections').delete();
                } catch(e) {

                }
            }
        }

        await deleteKeys(await getKeysWithPrefix('persons:sections:'));

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
