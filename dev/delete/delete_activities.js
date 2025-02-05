const cacheService = require('../../services/cache');
const { loadScriptEnv, isProdApp } = require('../../services/shared');
const { deleteKeys, getKeysWithPrefix } = require('../../services/cache');

loadScriptEnv();


function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: activities');

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

            let conn = require('knex')({
                client: process.env.DB_CLIENT,
                connection: connection,
            });

            await conn('activities_persons')
                .delete();

            await conn('activities_notifications')
                .delete();

            await conn('activities')
                .delete();

            let ps = [
                getKeysWithPrefix(cacheService.keys.activities('')),
                getKeysWithPrefix(cacheService.keys.activities_notifications('*')),
                getKeysWithPrefix(cacheService.keys.persons_activities('')),
                getKeysWithPrefix(cacheService.keys.persons_notifications(''))
            ];

            let delete_keys = [];

            for(let p of ps) {
                let keys = await p;

                delete_keys = delete_keys.concat(keys);
            }

            await deleteKeys(delete_keys);
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
