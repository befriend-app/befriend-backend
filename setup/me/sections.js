const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        let db_dict = {};
        let table_name = 'me_sections';
        let token_key = 'section_key';
        let added = 0;
        let updated = 0;

        try {
            let conn = await dbService.conn();

            let previous = await conn(table_name);

            for(let item of previous) {
                db_dict[item[token_key]] = item;
            }

            let endpoint = dataEndpoint(`/sections`);

            let r = await axios.get(endpoint);

            for(let item of r.data.items) {
                let db_item = db_dict[item[token_key]];

                if(!db_item) {
                    let new_item = structuredClone(item);
                    new_item.created = timeNow();
                    new_item.updated = timeNow();

                    let [id] = await conn(table_name)
                        .insert(new_item);

                    added++;

                    new_item.id = id;

                    db_dict[item[token_key]] = new_item;
                } else {
                    if(item.updated > db_item.updated) {
                        delete item.updated;

                        let update_obj = {};

                        for(let k in item) {
                            if(db_item[k] !== item[k]) {
                                update_obj[k] = item[k];
                            }
                        }

                        if(Object.keys(update_obj).length) {
                            update_obj.updated = timeNow();

                            await conn(table_name)
                                .where('id', db_item.id)
                                .update(update_obj);

                            updated++;
                        }
                    }
                }
            }

            console.log({
                added,
                updated
            });
        } catch(e) {
            console.error(e);
            return reject();
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
