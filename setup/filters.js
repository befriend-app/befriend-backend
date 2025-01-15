const { timeNow, loadScriptEnv } = require('../services/shared');
const dbService = require('../services/db');
const { deleteKeys, keys } = require('../services/cache');
const { filterMappings } = require('../services/filters');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Add filters');

            let conn = await dbService.conn();
            const now = timeNow();

            let index = 0;

            for (let [key, filter] of Object.entries(filterMappings)) {
                index++;

                let insert_data = {
                    token: filter.token,
                    name: filter.name,
                    position: index,
                    updated: now
                };

                if (filter.single) {
                    insert_data.is_single = true;
                }

                if (filter.multi) {
                    insert_data.is_multi = true;
                }

                const exists = await conn('filters').where('token', filter.token).first();

                if (!exists) {
                    await conn('filters').insert({
                        ...filter,
                        created: now,
                    });
                } else {
                    await conn('filters')
                        .where('id', exists.id)
                        .update(filter);
                }
            }

            await deleteKeys(keys.filters);

            console.log('Filters added');
            resolve();
        } catch (error) {
            console.error('Error adding filters:', error);
            reject(error);
        }
    });
}

module.exports = {
    main,
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    })();
}
