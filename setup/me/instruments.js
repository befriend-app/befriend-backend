const axios = require('axios');
const { loadScriptEnv, timeNow, generateToken, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');

loadScriptEnv();

let db_dict = {};

function syncInstruments() {
    return new Promise(async (resolve, reject) => {
        console.log("Add instruments");

        let table_name = 'instruments';
        let token_key = 'token';
        let added = 0;
        let updated = 0;

        try {
            let conn = await dbService.conn();

            let previous = await conn(table_name);

            for(let item of previous) {
                db_dict[item[token_key]] = item;
            }

            let endpoint = dataEndpoint(`/instruments`);

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

                            //remove specific activity type from cache
                            await cacheService.deleteKeys(cacheService.keys.activity_type(item[token_key]));

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

function indexInstruments() {
    return new Promise(async (resolve, reject) => {
        console.log("Index instruments");

        try {
            let conn = await dbService.conn();

            let instruments = await conn('instruments')
                .orderBy('is_common', 'desc')
                .orderBy('name', 'asc');

            let instruments_common = instruments.filter((item) => item.is_common);

            await cacheService.setCache(cacheService.keys.instruments, instruments);
            await cacheService.setCache(cacheService.keys.instruments_common, instruments_common);

            await cacheService.prefixIndexer(instruments, 'popularity', {
                mainKey: cacheService.keys.instrument,
                prefixKey: cacheService.keys.instruments_prefix,
            });
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncInstruments();

            await indexInstruments();

            resolve();
        } catch (e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

module.exports = {
    main: main,
    index: indexInstruments,
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
