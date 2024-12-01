const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

async function syncWorkIndustries() {
    return new Promise(async (resolve, reject) => {
        console.log('Sync work industries');

        let main_table = 'work_industries';
        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];

        try {
            let conn = await dbService.conn();

            // Industries lookup
            let industries_dict = {};
            let industries = await conn(main_table);

            for (let industry of industries) {
                industries_dict[industry.token] = industry;
            }

            let endpoint = dataEndpoint(`/work/industries`);
            let r = await axios.get(endpoint);

            for (let item of r.data.items) {
                let db_item = industries_dict[item.token];

                if (!db_item) {
                    if (item.deleted) continue;

                    let new_item = {
                        token: item.token,
                        name: item.name,
                        is_visible: item.is_visible,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    batch_insert.push(new_item);
                    added++;
                } else if (item.updated > db_item.updated) {
                    let update_obj = {
                        id: db_item.id,
                        name: item.name,
                        is_visible: item.is_visible,
                        updated: timeNow(),
                        deleted: item.deleted ? timeNow() : null,
                    };

                    batch_update.push(update_obj);
                    updated++;
                }
            }

            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({
                industries: {
                    added,
                    updated,
                },
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

async function syncWorkRoles() {
    return new Promise(async (resolve, reject) => {
        console.log('Sync work roles');

        let main_table = 'work_roles';
        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];

        try {
            let conn = await dbService.conn();

            // Roles lookup
            let roles_dict = {};
            let roles = await conn(main_table);

            for (let role of roles) {
                roles_dict[role.token] = role;
            }

            let endpoint = dataEndpoint(`/work/roles`);
            let r = await axios.get(endpoint);

            for (let item of r.data.items) {
                let db_item = roles_dict[item.token];

                if (!db_item) {
                    if (item.deleted) continue;

                    let new_item = {
                        token: item.token,
                        name: item.name,
                        category_token: item.category_token,
                        category_name: item.category_name,
                        is_visible: item.is_visible,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    batch_insert.push(new_item);
                    added++;
                } else if (item.updated > db_item.updated) {
                    let update_obj = {
                        id: db_item.id,
                        name: item.name,
                        category_token: item.category_token,
                        category_name: item.category_name,
                        is_visible: item.is_visible,
                        updated: timeNow(),
                        deleted: item.deleted ? timeNow() : null,
                    };

                    batch_update.push(update_obj);
                    updated++;
                }
            }

            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            console.log({
                roles: {
                    added,
                    updated,
                },
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncWorkIndustries();
            await syncWorkRoles();

            // Clear caches
            await cacheService.deleteKeys([
                cacheService.keys.work_industries,
                cacheService.keys.work_roles,
            ]);

            resolve();
        } catch (e) {
            console.error(e);
            reject(e);
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
        } catch (e) {
            console.error(e);
        }
    })();
}