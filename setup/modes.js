const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { loadScriptEnv, timeNow } = require('../services/shared');
const { deleteKeys } = require('../services/cache');

const { modes } = require('../services/modes');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add Modes');

        let table_name = 'modes';

        try {
            let conn = await dbService.conn();

            for (let i = 0; i < modes.data.length; i++) {
                let mode = modes.data[i];

                let qry = await conn(table_name)
                    .where('token', mode.token)
                    .first();

                if (!qry) {
                    await conn(table_name)
                        .insert({
                            ...mode,
                            sort_position: i,
                            created: timeNow(),
                            updated: timeNow()
                        });
                }
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        await deleteKeys(cacheService.keys.modes);

        console.log('modes added');

        resolve();
    });
}

module.exports = {
    main: main,
};

//script executed directly
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
