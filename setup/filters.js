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

            for (let [key, data] of Object.entries(filterMappings)) {
                index++;

                let filter = structuredClone(data);

                delete filter.table;
                delete filter.column;
                delete filter.filters_table;

                if (filter.single) {
                    filter.is_single = true;
                }

                if (filter.multi) {
                    filter.is_multi = true;
                }

                delete filter.single;
                delete filter.multi;

                const exists = await conn('filters').where('token', filter.token).first();

                filter.position = index;

                if (!exists) {
                    await conn('filters').insert({
                        ...filter,
                        created: now,
                        updated: now,
                    });
                } else {
                    await conn('filters')
                        .where('id', exists.id)
                        .update({
                            ...filter,
                            updated: now,
                        });
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
