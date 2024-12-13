const axios = require('axios');
const { loadScriptEnv, timeNow, dataEndpoint } = require('../../services/shared');
const dbService = require('../../services/db');
const cacheService = require('../../services/cache');
const { keys: systemKeys } = require('../../services/system');

loadScriptEnv();

async function syncLanguages() {
    return new Promise(async (resolve, reject) => {
        console.log('Sync languages');

        let main_table = 'languages';
        let added = 0;
        let updated = 0;
        let batch_insert = [];
        let batch_update = [];

        try {
            let conn = await dbService.conn();

            // Languages lookup
            let languages_dict = {};
            let languages = await conn(main_table);

            for (let language of languages) {
                languages_dict[language.token] = language;
            }

            let endpoint = dataEndpoint(`/languages`);

            let r = await axios.get(endpoint);

            for (let item of r.data.items) {
                let db_item = languages_dict[item.token];

                if (!db_item) {
                    //do not insert deleted language
                    if (item.deleted) {
                        continue;
                    }

                    let new_item = {
                        token: item.token,
                        name: item.name,
                        sort_position: item.sort_position,
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
                        sort_position: item.sort_position,
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
                languages: {
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

async function syncLanguagesCountries() {
    return new Promise(async (resolve, reject) => {
        console.log('Sync top languages by country');

        let main_table = 'top_languages_countries';
        let added = 0;
        let updated = 0;
        let deleted = 0;
        let batch_insert = [];
        let batch_update = [];
        let batch_delete = [];

        try {
            let conn = await dbService.conn();

            // Get lookups
            let [countries, languages] = await Promise.all([
                conn('open_countries').select('id', 'country_code'),
                conn('languages').select('id', 'token'),
            ]);

            let countriesDict = {};
            let languagesDict = {};

            for (let country of countries) {
                countriesDict[country.country_code] = country.id;
            }

            for (let language of languages) {
                languagesDict[language.token] = language.id;
            }

            // Get existing associations
            let existing = await conn(main_table);
            let existingDict = {};

            for (let assoc of existing) {
                if (!(assoc.country_id in existingDict)) {
                    existingDict[assoc.country_id] = {};
                }

                existingDict[assoc.country_id][assoc.language_id] = assoc;
            }

            let endpoint = dataEndpoint(`/languages/countries`);

            let r = await axios.get(endpoint);

            // Process country language associations
            for (let code in r.data.items) {
                let countryData = r.data.items[code];
                let country_id = countriesDict[code];

                if (!country_id) {
                    console.warn(`Country not found: ${countryData.country_code}`);
                    continue;
                }

                let currentLanguages = {};

                for (let language_token in countryData) {
                    let langData = countryData[language_token];
                    let language_id = languagesDict[language_token];

                    if (!language_id) {
                        console.warn(`Language not found: ${language_token} for country ${code}`);
                        continue;
                    }

                    currentLanguages[language_id] = true;

                    let existing = existingDict[country_id]?.[language_id];

                    if (!existing) {
                        batch_insert.push({
                            country_id,
                            language_id,
                            sort_position: langData.sort_position,
                            is_visible: true,
                            created: timeNow(),
                            updated: timeNow(),
                        });
                        added++;
                    } else if (
                        langData.updated > existing.updated ||
                        langData.sort_position !== existing.sort_position
                    ) {
                        batch_update.push({
                            id: existing.id,
                            sort_position: langData.sort_position,
                            updated: timeNow(),
                        });
                        updated++;
                    }
                }

                // Handle deletions - languages no longer in top list for country
                if (existingDict[country_id]) {
                    for (let language_id in existingDict[country_id]) {
                        if (!currentLanguages[language_id]) {
                            let existing = existingDict[country_id][language_id];

                            if (!existing.deleted) {
                                batch_delete.push({
                                    id: existing.id,
                                    deleted: timeNow(),
                                    updated: timeNow(),
                                });
                                deleted++;
                            }
                        }
                    }
                }
            }

            // Process batches
            if (batch_insert.length) {
                await dbService.batchInsert(main_table, batch_insert);
            }

            if (batch_update.length) {
                await dbService.batchUpdate(main_table, batch_update);
            }

            if (batch_delete.length) {
                await dbService.batchUpdate(main_table, batch_delete);
            }

            console.log({
                top_languages: {
                    added,
                    updated,
                    deleted,
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

            await syncLanguages();
            await syncLanguagesCountries();

            // Clear caches
            await cacheService.deleteKeys([cacheService.keys.languages]);

            await cacheService.deleteKeys(
                await cacheService.getKeysWithPrefix(cacheService.keys.languages_country('')),
            );

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
