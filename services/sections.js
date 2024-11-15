const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow, getCountries } = require('./shared');
const { setCache, getObj } = require('./cache');
const { getPerson } = require('./persons');

let sectionsData = {
    instruments: {
        myStr: 'My Instruments',
        tables: {
            instruments: {
                data: {
                    name: 'instruments'
                },
                user: {
                    name: 'persons_instruments',
                    cols: {
                        id: 'instrument_id',
                        secondary: 'skill_level'
                    },
                },
            }
        },
        categories: {
            options: ['String', 'Wind', 'Brass', 'Percussion', 'Keyboard', 'Electronic', 'Voice'],
        },
        secondary: {
            options: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Virtuoso'],
            unselectedStr: 'Skill Level',
        },
        autoComplete: {
            minChars: 1,
            endpoint: '/autocomplete/instruments',
            placeholders: {
                main: 'Search instruments',
            },
        },
        cacheKeys: {
            display: cacheService.keys.instruments_common,
        },
        functions: {
            data: 'getInstruments',
            all: 'allInstruments',
        },
        styles: {
            rowCols: 'cols-2'
        }
    },
    music: {
        myStr: 'My Music',
        cols: {
            id: 'instrument_id',
        },
        categories: {
            options: null,
            fn: `getMusicGenres`,
            hasKey: true, //key of country code
        },
        autoComplete: {
            minChars: 1,
            endpoint: '/autocomplete/instruments',
            placeholders: {
                main: 'Search instruments',
            },
        },
        cacheKeys: {
            // display: cacheService.keys.instruments_common,
        },
        functions: {
            data: '',
            all: '',
        },
        styles: {
            rowCols: 'cols-2'
        }
    },
    schools: {
        tables: {
            schools: {
                data: {
                    name: 'schools'
                },
                user: {
                    name: 'persons_schools',
                    cols: {
                        id: 'school_id',
                        token: 'school_token',
                        hashToken: 'hash_token'
                    },
                },
            }
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/schools',
            placeholders: {
                main: 'Search schools',
                list: 'Country',
            },
            filter: {
                hashKey: 'code',
                list: [],
                noResults: 'No countries found'
            },
            groups: {
                college: {
                    name: 'Universities and Colleges'
                },
                hs: {
                    name: 'High Schools'
                },
                grade: {
                    name: 'Middle Schools'
                },
                other: {
                    name: 'Other',
                }
            }
        },
        cacheKeys: {
            byHashToken: cacheService.keys.schools_country,
        },
        functions: {
            filterList: 'getSchools',
        },
        styles: {
            rowCols: 'cols-1'
        }
    },
};

function addMeSection(person_token, section_key) {
    function addDataToSection(section) {
        return new Promise(async (resolve, reject) => {
            if (section_key in sectionsData) {
                let fnData = sectionsData[section_key].functions.data;
                let fnFilterList = sectionsData[section_key].functions.filterList;

                if (fnData) {
                    section.data = await module.exports[fnData]();
                }

                if (fnFilterList) {
                    section.data = await module.exports[fnFilterList]();
                }
            }

            resolve();
        });
    }

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

            if (!(section_key in sections_dict.byKey)) {
                return reject('Invalid section key');
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
                let new_section = {
                    person_id: person.id,
                    section_id: section_data.id,
                    position: Object.keys(person_sections).length,
                    created: timeNow(),
                    updated: timeNow(),
                };

                let [id] = await conn('persons_sections').insert(new_section);

                new_section.id = id;

                //add to cache
                person_sections[section_key] = new_section;

                await setCache(cache_key, person_sections);

                await addDataToSection(new_section);

                new_section.items = {};

                return resolve(new_section);
            }

            let existing_section = person_sections[section_key];

            //remove deleted
            if (existing_section && !existing_section.deleted) {
                return reject('Section already active');
            }

            //db
            existing_section.updated = timeNow();
            existing_section.deleted = null;

            await conn('persons_sections').where('id', existing_section.id).update({
                updated: existing_section.updated,
                deleted: null,
            });

            //cache
            await cacheService.setCache(cache_key, person_sections);

            await addDataToSection(existing_section);

            existing_section.items = await getPersonSectionItems(person, section_key);

            resolve(existing_section);
        } catch (e) {
            console.error(e);
            return reject();
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

function addMeSectionItem(person_token, section_key, table_key, item_token, hash_token) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!section_key) {
                return reject('Section key required');
            }

            if(!table_key) {
                return reject('Table key required');
            }

            if(!item_token) {
                return reject('Item token required');
            }

            let sectionData = sectionsData[section_key];

            if(!sectionData) {
                return reject('Invalid section key');
            }

            let userTableData = sectionData.tables[table_key]?.user;

            if(!userTableData) {
                return reject('Invalid table key');
            }

            let fnAll = sectionData.functions.all;

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

            let section_option;

            if (fnAll) {
                options = await module.exports[fnAll]();
                section_option = options.byToken[item_token];
            } else if (sectionData.cacheKeys.byHashToken) {
                let cache_key = sectionData.cacheKeys.byHashToken(hash_token);
                section_option = await cacheService.hGetItem(cache_key, item_token);
            }

            if (!section_option) {
                return reject('Item not found');
            }

            let section_items = await getPersonSectionItems(person, section_key);

            if (!(item_token in section_items)) {
                let item_data;

                //prevent duplicate item after deletion
                let exists_qry = await conn(userTableData.name)
                    .where('person_id', person.id)
                    .where(userTableData.cols.id, section_option.id)
                    .first();

                if (exists_qry) {
                    if (!exists_qry.deleted) {
                        return reject('No change');
                    }

                    exists_qry.updated = timeNow();

                    await conn(userTableData.name).where('id', exists_qry.id).update({
                        updated: exists_qry.updated,
                        deleted: null,
                    });

                    item_data = exists_qry;

                    item_data.secondary = item_data[userTableData.cols.secondary]
                        ? item_data[userTableData.cols.secondary]
                        : null;

                    delete item_data.deleted;
                } else {
                    let insert_data = {
                        person_id: person.id,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    if(userTableData.cols.token) {
                        insert_data[userTableData.cols.token] = section_option.token;
                    }

                    if(userTableData.cols.hashToken) {
                        insert_data[userTableData.cols.hashToken] = section_option[sectionData.autoComplete.filter.hashKey];
                    }

                    insert_data[userTableData.cols.id] = section_option.id;

                    let [id] = await conn(userTableData.name).insert(insert_data);

                    insert_data.id = id;

                    item_data = insert_data;
                }

                delete section_option.id;

                section_items[item_token] = {
                    ...section_option,
                    ...item_data,
                };

                let cache_key = cacheService.keys.person_sections_data(
                    person.person_token,
                    section_key,
                );

                await cacheService.setCache(cache_key, section_items);

                return resolve({
                    ...section_option,
                    ...item_data,
                });
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
            let { person_token, section_key, table_key, section_item_id, secondary, is_delete } = body;

            if (!secondary && typeof is_delete === 'undefined') {
                return reject('Invalid request');
            }

            if (!person_token || !section_key || !section_item_id) {
                return reject('Person, name, and section item id required');
            }

            if(!table_key) {
                return reject('Table key required');
            }

            let sectionData = sectionsData[section_key];

            if(!sectionData) {
                return reject('Section not found');
            }

            let userTableData = sectionData.tables?.[table_key]?.user;

            if(!userTableData) {
                return reject('Invalid table key');
            }

            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            let conn = await dbService.conn();

            if (secondary || is_delete) {
                let secondary_col = userTableData.cols.secondary;

                let data = {
                    updated: timeNow(),
                };

                if (is_delete) {
                    data.deleted = timeNow();
                } else {
                    data[secondary_col] = secondary;
                }

                let update = await conn(userTableData.name)
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

            let sectionData = sectionsData[section_key];

            if(!sectionData) {
                return resolve({});
            }

            //todo remove
            if (!organized || true) {
                let fnAll = sectionData?.functions?.all;

                let options;

                if (fnAll) {
                    options = await module.exports[fnAll]();
                }

                organized = {};

                let conn = await dbService.conn();

                for(let table_key in sectionData.tables) {
                    let userTableData = sectionData.tables[table_key]?.user;

                    let qry = await conn(userTableData.name)
                        .where('person_id', person.id)
                        .whereNull('deleted');

                    let col_name = userTableData.cols.id;
                    let secondary_col_name = userTableData.cols.secondary;
                    let token_col = userTableData.cols.token;
                    let hash_token_col = userTableData.cols.hashToken;

                    for (let item of qry) {
                        item.table_key = table_key;

                        let section_option;

                        if (options) {
                            section_option = options.byId[item[col_name]];
                        } else if (sectionData.cacheKeys.byHashToken) {
                            let cache_key = sectionData.cacheKeys.byHashToken(item[hash_token_col]);

                            section_option = await cacheService.hGetItem(cache_key, item[token_col]);
                        }

                        item.secondary = item[secondary_col_name];

                        organized[section_option.token] = {
                            ...section_option,
                            ...item,
                        };
                    }
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

        if (!section_keys?.length) {
            return resolve({});
        }

        let missing_keys = {};
        let multi = cacheService.conn.multi();

        try {
            // Batch cache
            for (let key of section_keys) {
                if (!(key in sectionsData)) {
                    continue;
                }

                const sectionConfig = sectionsData[key];

                // If display key
                if (sectionConfig.cacheKeys?.display) {
                    multi.get(sectionConfig.cacheKeys.display);
                }

                // Always get person-specific items
                const cache_key_items = cacheService.keys.person_sections_data(
                    person.person_token,
                    key,
                );
                multi.get(cache_key_items);
            }

            let results = await cacheService.execMulti(multi);

            results = results.map((result) => {
                if (result) {
                    try {
                        return JSON.parse(result);
                    } catch (e) {
                        return result;
                    }
                }
                return null;
            });

            let resultIndex = 0;

            for (let section_key of section_keys) {
                if (!(section_key in sectionsData)) {
                    continue;
                }

                const sectionConfig = sectionsData[section_key];
                let options = null;
                let filterList = null;
                let items = null;

                // If display key
                if (sectionConfig.cacheKeys?.display) {
                    options = results[resultIndex++];
                }

                if (sectionConfig.functions?.filterList) {
                    filterList = await module.exports[sectionConfig.functions.filterList]();
                }

                items = results[resultIndex++];

                if (options || filterList) {
                    let categories = sectionConfig.categories?.options;

                    sections[section_key].data = {
                        myStr: sectionConfig.myStr || null,
                        tables: Object.keys(sectionConfig.tables),
                        options: options,
                        autoComplete: {
                            ...sectionConfig.autoComplete,
                        },
                        categories: categories || null,
                        secondary: sectionConfig.secondary || null,
                        styles: sectionConfig.styles || null,
                    };

                    sections[section_key].items = items || {};
                } else {
                    missing_keys[section_key] = 1;
                }
            }

            // Fetch missing data
            for (let key in missing_keys) {
                let fnData = sectionsData[key].functions.data;
                let data = await module.exports[fnData]();
                let items = await getPersonSectionItems(person, key);

                sections[key].data = data;
                sections[key].items = items;
            }

            // Clean up items
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
        } catch (e) {
            console.error('Error in getSectionData:', e);
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

            let section = sectionsData.instruments;

            let data = {
                options,
                myStr: section.myStr,
                autoComplete: section.autoComplete,
                categories: section.categories.options,
                secondary: section.secondary,
                styles: section.styles,
                tables: Object.keys(section.tables),
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

            if (false && data) {
                return resolve(data);
            }

            let conn = await dbService.conn();

            data = await conn('instruments').orderBy('popularity', 'desc');

            data = data.reduce((acc, item) => {
                acc.byId[item.id] = item;
                acc.byToken[item.token] = item;
                return acc;
            }, {byId: {}, byToken: {}});

            await cacheService.setCache(cache_key, data);

            resolve(data);
        } catch (e) {
            console.error(e);
        }
    });
}

function getSchools() {
    return new Promise(async (resolve, reject) => {
        //list of countries for autocomplete
        try {
            let section = sectionsData.schools;

            let data = {
                autoComplete: section.autoComplete,
                myStr: section.myStr,
                styles: section.styles,
                tables: Object.keys(section.tables),
            };

            let countries = await getCountries();

            countries.map((country) => {
                if (country.country_name && !country.name) {
                    country.name = country.country_name;
                }
            });

            data.autoComplete.filter.list = countries || [];
            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
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
    getSchools: getSchools,
};
