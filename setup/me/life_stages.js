const dbService = require('../../services/db');
const { loadScriptEnv, dataEndpoint, timeNow } = require('../../services/shared');
const axios = require('axios');
const { deleteKeys, keys } = require('../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add life stages');

        let table_name = 'life_stages';
        let added = 0;
        let updated = 0;

        try {
            await deleteKeys(keys.life_stages);

            let conn = await dbService.conn();

            let endpoint = dataEndpoint(`/life-stages`);
            let response = await axios.get(endpoint);
            let items = response.data.items;

            for (let item of items) {
                let existingItem = await conn(table_name).where('token', item.token).first();

                if (existingItem) {
                    if (item.updated > existingItem.updated) {
                        item.updated = timeNow();

                        // Update existing item
                        await conn(table_name).where('token', item.token).update(item);
                        updated++;
                    }
                } else {
                    // Add new item
                    item.created = timeNow();
                    item.updated = timeNow();
                    await conn(table_name).insert(item);
                    added++;
                }
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        console.log('Life stages added', {
            added,
            updated,
        });

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
