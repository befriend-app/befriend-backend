const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');
const { setCache } = require('./cache');
const { getPerson } = require('./persons');

let sectionsData = {
    instruments: {
        colId: 'instrument_id',
        secondaryCol: 'skill_level',
        categories: ['String', 'Wind', 'Brass', 'Percussion', 'Keyboard', 'Electronic'],
        secondary: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Virtuoso'],
        unselectedStr: 'Skill Level',
        autoComplete: {
            string: 'Search instruments',
            endpoint: '/autocomplete/instruments',
        },
        cache_key: cacheService.keys.instruments_common,
        functions: {
            data: 'getInstruments',
            all: 'allInstruments',
        },
    },
};

function addMeSection(person_token, section_key) {
    return new Promise(async (resolve, reject) => {
        if (!person_token || !section_key) {
            return reject('Person and section key required');
        }

        let sections_dict = {
            byId: {},
            byKey: {},
        };

        try {
            let person = await getPerson(person_token);

            if (!person) {
                return reject('No person found');
            }

            let conn = await dbService.conn();
            let cache_key = cacheService.keys.person_sections(person.person_token);

            let all_sections = await getAllMeSections();

            for (let section of all_sections) {
                sections_dict.byId[section.id] = section;
                sections_dict.byKey[section.section_key] = section;
            }

            let person_sections = await cacheService.getObj(cache_key);

            if (!person_sections) {
                person_sections = {};

                let sections_qry = await conn('persons_sections')
                    .where('person_id', person.id)
                    .orderBy('position', 'asc');

                for (let section of sections_qry) {
                    let section_data = sections_dict.byId[section.section_id];

                    person_sections[section_data.section_key] = section;
                }
            }

            //check if valid
            if (!(section_key in sections_dict.byKey)) {
                return reject('Invalid section key');
            }

            let section_data = sections_dict.byKey[section_key];

            //check if exists
            if (!(section_key in person_sections)) {
                //add to db
                let data = {
                    person_id: person.id,
                    section_id: section_data.id,
                    position: Object.keys(person_sections).length,
                    created: timeNow(),
                    updated: timeNow(),
                };

                let [id] = await conn('persons_sections').insert(data);

                data.id = id;

                //add to cache
                person_sections[section_key] = data;

                await setCache(cache_key, person_sections);

                if (section_key in sectionsData) {
                    let fnData = sectionsData[section_key].functions.data;

                    if (fnData) {
                        data.data = await module.exports[fnData]();
                    }
                }

                data.items = {};

                resolve(data);
            } else {
                let section = person_sections[section_key];

                //remove deleted
                if (section && !section.deleted) {
                    return reject('Section added previously');
                }

                //db
                section.updated = timeNow();
                section.deleted = null;

                await conn('persons_sections').where('id', section.id).update({
                    updated: section.updated,
                    deleted: null,
                });

                //cache
                await cacheService.setCache(cache_key, person_sections);

                if (section_key in sectionsData) {
                    let fnData = sectionsData[section_key].functions.data;

                    if (fnData) {
                        section.data = await module.exports[fnData]();
                    }
                }

                section.items = await getPersonSectionItems(person, section_key);

                resolve(section);
            }
        } catch (e) {
            console.error(e);
        }
    });
}

function deleteMeSection(person_token, section_key) {
    return new Promise(async (resolve, reject) => {
        if (!person_token || !section_key) {
            return reject('Person and section key required');
        }

        let sections_dict = {
            byKey: {},
        };

        try {
            let person = await getPerson(person_token);

            if (!person) {
                return reject('No person found');
            }

            let conn = await dbService.conn();
            let cache_key = cacheService.keys.person_sections(person.person_token);

            let all_sections = await getAllMeSections();

            for (let section of all_sections) {
                sections_dict.byKey[section.section_key] = section;
            }

            let person_sections = await cacheService.getObj(cache_key);

            let ts = timeNow();

            if (person_sections && section_key in person_sections) {
                //update db
                let section = person_sections[section_key];

                section.updated = ts;
                section.deleted = ts;

                try {
                    await conn('persons_sections')
                        .where('id', section.id)
                        .where('person_id', person.id)
                        .update({
                            updated: section.updated,
                            deleted: section.deleted,
                        });
                } catch (e) {
                    console.error(e);
                }

                //update cache
                await setCache(cache_key, person_sections);

                return resolve();
            } else {
                return reject('Expected section key for person sections');
            }
        } catch (e) {
            console.error(e);
        }
    });
}

function addMeSectionItem(person_token, section_key, item_token) {
    return new Promise(async (resolve, reject) => {
        try {
            let fnAll = sectionsData[section_key].functions.all;

            if (!section_key || !item_token) {
                return reject('Section key and item token required');
            }

            let options = null;

            let conn = await dbService.conn();

            let person = await getPerson(person_token);

            if (!person) {
                return reject('No person found');
            }

            let me_sections = await getAllMeSections();

            let this_section = me_sections.find((section) => section.section_key === section_key);

            if (!this_section) {
                return reject('Section not found');
            }

            let table_name = `persons_${section_key}`;
            let data_id_col = sectionsData[section_key].colId;

            options = await module.exports[fnAll]();

            let section_data = await getPersonSectionItems(person, section_key);

            let section_option = options.find((opt) => opt.token === item_token);

            if (!section_option) {
                return reject('Item not found');
            }

            if (!(item_token in section_data)) {
                let item_data;

                //prevent duplicate item after deletion
                let exists_qry = await conn(table_name)
                    .where('person_id', person.id)
                    .where(data_id_col, section_option.id)
                    .first();

                if (exists_qry) {
                    let secondary_col = sectionsData[section_key].secondaryCol;

                    if (!exists_qry.deleted) {
                        return reject('No change');
                    }

                    exists_qry.updated = timeNow();

                    await conn(table_name).where('id', exists_qry.id).update({
                        updated: exists_qry.updated,
                        deleted: null,
                    });

                    item_data = exists_qry;

                    item_data.secondary = item_data[secondary_col]
                        ? item_data[secondary_col]
                        : null;

                    delete item_data.deleted;
                } else {
                    let insert_data = {
                        person_id: person.id,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    insert_data[data_id_col] = section_option.id;

                    let [id] = await conn(table_name).insert(insert_data);

                    insert_data.id = id;

                    item_data = insert_data;
                }

                section_data[item_token] = {
                    ...section_option,
                    ...item_data,
                };

                let cache_key = cacheService.keys.person_sections_data(
                    person.person_token,
                    section_key,
                );

                await cacheService.setCache(cache_key, section_data);

                return resolve(item_data);
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

function updateMeSectionItem(body) {
    return new Promise(async (resolve, reject) => {
        try {
            let { person_token, section_key, section_item_id, secondary, is_delete } = body;

            if (!person_token || !section_key || !section_item_id) {
                return reject('Person, name, and section item id required');
            }

            if (!secondary && typeof is_delete === 'undefined') {
                return reject('Invalid request');
            }

            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            let conn = await dbService.conn();

            if (secondary || is_delete) {
                let secondary_col = sectionsData[section_key].secondaryCol;

                let data = {
                    updated: timeNow(),
                };

                if (is_delete) {
                    data.deleted = timeNow();
                } else {
                    data[secondary_col] = secondary;
                }

                let update = await conn(`persons_${section_key}`)
                    .where('id', section_item_id)
                    .where('person_id', person.id)
                    .update(data);

                if (update === 1) {
                    //update cache
                    let cache_key = cacheService.keys.person_sections_data(
                        person.person_token,
                        section_key,
                    );

                    let cache_data = await cacheService.getObj(cache_key);

                    if (cache_data) {
                        for (let token in cache_data) {
                            let item = cache_data[token];

                            if (item.id === section_item_id) {
                                item.updated = data.updated;

                                if (is_delete) {
                                    item.deleted = data.deleted;
                                } else {
                                    item.secondary = secondary;
                                }
                                break;
                            }
                        }

                        await cacheService.setCache(cache_key, cache_data);
                    }
                }
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonSectionItems(person, section_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.person_sections_data(
                person.person_token,
                section_key,
            );

            let organized = await cacheService.getObj(cache_key);

            //todo remove
            if (!organized || true) {
                let fnAll = sectionsData[section_key].functions.all;
                let options = await module.exports[fnAll]();

                organized = {};

                let conn = await dbService.conn();

                let qry = await conn(`persons_${section_key}`)
                    .where('person_id', person.id)
                    .whereNull('deleted');

                let col_name = sectionsData[section_key].colId;

                let secondary_col_name = sectionsData[section_key].secondaryCol;

                for (let item of qry) {
                    let section_option = options.find((_item) => _item.id === item[col_name]);

                    item.secondary = item[secondary_col_name];

                    organized[section_option.token] = {
                        ...section_option,
                        ...item,
                    };
                }

                await setCache(cache_key, organized);
            }

            //remove deleted items
            for (let token in organized) {
                let item = organized[token];

                if (item.deleted) {
                    delete organized[token];
                }
            }

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getAllMeSections() {
    return new Promise(async (resolve, reject) => {
        let me_sections_cache_key = cacheService.keys.me_sections;

        try {
            let conn = await dbService.conn();

            let all_me_sections = await cacheService.getObj(me_sections_cache_key);

            if (!all_me_sections) {
                all_me_sections = await conn('me_sections')
                    .where('active', 1)
                    .orderBy('position', 'asc');

                if (all_me_sections) {
                    await cacheService.setCache(me_sections_cache_key, all_me_sections);
                }
            }

            resolve(all_me_sections);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getMeSections(person) {
    return new Promise(async (resolve, reject) => {
        if (!person || !person.person_token) {
            return resolve('person required');
        }

        //options, active, data

        //lookup dict
        let me_dict = {
            byId: {},
            byKey: {},
        };

        //return object
        let organized = {
            all: {},
            options: {},
            active: {},
        };

        try {
            let conn = await dbService.conn();

            let person_sections_cache_key = cacheService.keys.person_sections(person.person_token);

            //all me sections
            let all_me_sections = await getAllMeSections();

            for (let section of all_me_sections) {
                me_dict.byId[section.id] = section;
                me_dict.byKey[section.section_key] = section;

                organized.all[section.section_key] = section;
            }

            //person sections
            let person_sections = await cacheService.getObj(person_sections_cache_key);

            if (!person_sections) {
                person_sections = {};

                let sections_qry = await conn('persons_sections')
                    .where('person_id', person.id)
                    .orderBy('position', 'asc');

                for (let section of sections_qry) {
                    let section_data = me_dict.byId[section.section_id];

                    person_sections[section_data.section_key] = section;
                }
            }

            //add to active first
            for (let section_key in person_sections) {
                let section = person_sections[section_key];

                if (!section.deleted) {
                    organized.active[section_key] = person_sections[section_key];
                }
            }

            //available sections
            for (let section of all_me_sections) {
                if (!(section.section_key in organized.active)) {
                    organized.options[section.section_key] = section;
                }
            }

            //add data options to active
            organized.active = await getActiveData(person, organized.active);

            return resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getActiveData(person, sections) {
    return new Promise(async (resolve, reject) => {
        let section_keys = Object.keys(sections);

        if (!section_keys || !section_keys.length) {
            return resolve({});
        }

        //get from cache first->multi
        //get missing from db

        let missing_keys = {};

        let multi = cacheService.conn.multi();

        try {
            //options, person items
            for (let key of section_keys) {
                if (!(key in sectionsData)) {
                    continue;
                }

                let cache_key_options = sectionsData[key].cache_key;
                let cache_key_items = cacheService.keys.person_sections_data(
                    person.person_token,
                    key,
                );
                multi.get(cache_key_options);
                multi.get(cache_key_items);
            }

            let results = await cacheService.execMulti(multi);

            for (let i = 0; i < results.length; i++) {
                let result = results[i];

                if (result) {
                    try {
                        results[i] = JSON.parse(result);
                    } catch (e) {}
                }
            }

            //set to section/missing
            for (let i = 0; i < section_keys.length; i++) {
                let section_key = section_keys[i];
                let section_config = sectionsData[section_key];

                let options = results[i * 2];
                let items = results[i * 2 + 1];

                if (options && items) {
                    sections[section_key].data = {
                        options: options,
                        autoComplete: section_config.autoComplete
                            ? section_config.autoComplete
                            : null,
                        categories: section_config.categories ? section_config.categories : null,
                        secondary: section_config.secondary ? section_config.secondary : null,
                        unselectedStr: section_config.unselectedStr
                            ? section_config.unselectedStr
                            : null,
                    };

                    sections[section_key].items = items;
                } else if (section_key in sectionsData) {
                    missing_keys[section_key] = 1;
                }
            }

            for (let key in missing_keys) {
                let fnData = sectionsData[key].functions.data;
                let data = await module.exports[fnData]();
                let items = await getPersonSectionItems(person, key);

                sections[key].data = data;
                sections[key].items = items;
            }
        } catch (e) {
            console.error(e);
        }

        // remove created/updated
        // delete deleted
        for (let key in sections) {
            let section = sections[key];

            for (let token in section.items) {
                let item = section.items[token];

                delete item.created;
                delete item.updated;

                if (item.deleted) {
                    delete section.items[token];
                }
            }
        }

        resolve(sections);
    });
}

function dataForSchema(table_name, cache_key, filter, sort_by, sort_direction) {
    return new Promise(async (resolve, reject) => {
        try {
            let cached_obj = await cacheService.getObj(cache_key);

            //todo remove
            if (cached_obj && false) {
                return resolve(cached_obj);
            }

            let conn = await dbService.conn();

            let qry = conn(table_name);

            if (sort_by) {
                qry = qry.orderBy(sort_by, sort_direction ? sort_direction : 'asc');
            }

            let data = await qry;

            if (filter) {
                data = data.filter((item) => item[filter]);
            }

            await cacheService.setCache(cache_key, data);

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getInstruments() {
    return new Promise(async (resolve, reject) => {
        try {
            let options = await dataForSchema(
                'instruments',
                cacheService.keys.instruments_common,
                'is_common',
                'popularity',
                'desc',
            );

            let data = {
                options: options,
                autoComplete: sectionsData.instruments.autoComplete,
                categories: sectionsData.instruments.categories,
                secondary: sectionsData.instruments.secondary,
                unselectedStr: sectionsData.instruments.unselectedStr,
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function allInstruments() {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.instruments;

        try {
            let data = await cacheService.getObj(cache_key);

            if (data) {
                return resolve(data);
            }

            let conn = await dbService.conn();

            data = await conn('instruments').orderBy('popularity', 'desc');

            await cacheService.setCache(cache_key, data);

            resolve(data);
        } catch (e) {
            console.error(e);
        }
    });
}

module.exports = {
    sections: sectionsData,
    addMeSection: addMeSection,
    deleteMeSection: deleteMeSection,
    addMeSectionItem: addMeSectionItem,
    updateMeSectionItem: updateMeSectionItem,
    getPersonSectionItems: getPersonSectionItems,
    getAllMeSections: getAllMeSections,
    getMeSections: getMeSections,
    getActiveData: getActiveData,
    dataForSchema: dataForSchema,
    getInstruments: getInstruments,
    allInstruments: allInstruments,
};
