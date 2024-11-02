const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');
const { setCache } = require('./cache');
const { getPerson } = require('./persons');

module.exports = {
    sections: {
        instruments: {
            categories: ['String', 'Wind', 'Brass', 'Percussion', 'Keyboard', 'Electronic'],
            secondary: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Virtuoso'],
            unselectedStr: 'Skill Level'
        },
    },
    dataIdMap: {
        instruments: 'instrument_id',
    },
    secondaryMap: {
        instruments: 'skill_level',
    },
    addMeSection: function (person_token, section_key) {
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

                let all_sections = await module.exports.getAllMeSections();

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

                    if (section_key === 'instruments') {
                        data.data = await module.exports.instruments();
                    }

                    data.items = {};

                    resolve(data);
                } else {
                    return reject('Section added previously');
                }
            } catch (e) {
                console.error(e);
            }
        });
    },
    addMeSectionItem: function (person_token, section_key, item_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!section_key || !item_token) {
                    return reject('Section key and item token required');
                }

                let options = null;

                let conn = await dbService.conn();

                let person = await getPerson(person_token);

                if (!person) {
                    return reject('No person found');
                }

                let me_sections = await module.exports.getAllMeSections();

                let this_section = me_sections.find(
                    (section) => section.section_key === section_key,
                );

                if (!this_section) {
                    return reject('Section not found');
                }

                if (this_section.data_table === 'instruments') {
                    options = await module.exports.allInstruments();
                }

                let section_data = await module.exports.getPersonSectionData(
                    person,
                    this_section,
                    options,
                );

                if (!(item_token in section_data)) {
                    let insert_data = {
                        person_id: person.id,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    let this_option = options.find((opt) => opt.token === item_token);

                    if (!this_option) {
                        return reject('Item not found');
                    }

                    insert_data[module.exports.dataIdMap[section_key]] = this_option.id;

                    let [id] = await conn(`persons_${this_section.data_table}`).insert(insert_data);

                    insert_data.id = id;

                    section_data[item_token] = {
                        ...insert_data,
                    };

                    let cache_key = cacheService.keys.person_sections_data(
                        person.person_token,
                        this_section.data_table,
                    );

                    await cacheService.setCache(cache_key, section_data);

                    return resolve(insert_data);
                }
            } catch (e) {
                console.error(e);
                return reject();
            }

            resolve();
        });
    },
    updateMeSectionItem: function (body) {
        return new Promise(async (resolve, reject) => {
            try {
                let {person_token, section_name, section_item_id, secondary, is_delete } = body;

                if(!person_token || !section_name || !section_item_id) {
                    return reject('Person, name, and section item id required');
                }

                if(!secondary && typeof is_delete === 'undefined') {
                    return reject('Invalid request');
                }

                let person = await getPerson(person_token);

                if(!person) {
                    return reject("Person not found")
                }

                let conn = await dbService.conn();

                if(secondary || is_delete) {
                    let secondary_col = module.exports.secondaryMap[section_name];

                    let data = {
                        updated: timeNow()
                    };

                    if(is_delete) {
                        data.deleted = timeNow();
                    } else {
                        data[secondary_col] = secondary;
                    }

                    let update = await conn(`persons_${section_name}`)
                        .where('id', section_item_id)
                        .where('person_id', person.id)
                        .update(data);

                    if(update === 1) {
                        //update cache
                        let cache_key = cacheService.keys.person_sections_data(person.person_token, section_name);

                        let cache_data = await cacheService.getObj(cache_key);

                        if(cache_data) {
                            for(let token in cache_data) {
                                let item = cache_data[token];

                                if(item.id === section_item_id) {
                                    item.updated = data.updated;

                                    if(is_delete) {
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
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getPersonSectionData: function (person, section, options) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.person_sections_data(
                    person.person_token,
                    section.data_table,
                );

                let organized = await cacheService.getObj(cache_key);

                if (!organized || true) {
                    organized = {};

                    let conn = await dbService.conn();

                    let qry = await conn(`persons_${section.data_table}`).where('person_id', person.id)
                        .whereNull('deleted');

                    let col_name = module.exports.dataIdMap[section.data_table];

                    let secondary_col_name = module.exports.secondaryMap[section.data_table];

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
                for(let token in organized) {
                    let item = organized[token];

                    if(item.deleted) {
                        delete organized[token];
                    }
                }

                resolve(organized);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getAllMeSections: function () {
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
    },
    getMeSections: function (person) {
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

                let person_sections_cache_key = cacheService.keys.person_sections(
                    person.person_token,
                );

                //all me sections
                let all_me_sections = await module.exports.getAllMeSections();

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
                    organized.active[section_key] = person_sections[section_key];
                }

                //available sections
                for (let section of all_me_sections) {
                    if (!(section.section_key in organized.active)) {
                        organized.options[section.section_key] = section;
                    }
                }

                //add data options to active
                if ('instruments' in organized.active) {
                    organized.active.instruments.data = await module.exports.instruments();

                    let options = await module.exports.allInstruments();

                    organized.active.instruments.items = await module.exports.getPersonSectionData(
                        person,
                        organized.all.instruments,
                        options,
                    );
                }

                return resolve(organized);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    sectionData: function (table_name, cache_key, filter, sort_by, sort_direction) {
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
    },
    instruments: function () {
        return new Promise(async (resolve, reject) => {
            try {
                let options = await module.exports.sectionData(
                    'instruments',
                    cacheService.keys.instruments_common,
                    'is_common',
                    'popularity',
                    'desc',
                );

                let data = {
                    autocomplete: {
                        string: 'Search instruments',
                        endpoint: '/autocomplete/instruments',
                    },
                    options: options,
                    categories: module.exports.sections.instruments.categories,
                    secondary: module.exports.sections.instruments.secondary,
                    unselectedStr: module.exports.sections.instruments.unselectedStr
                };

                resolve(data);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    allInstruments: function () {
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
    },
};
