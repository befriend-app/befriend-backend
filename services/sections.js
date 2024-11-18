const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow, getCountries, latLonLookup, isNumeric } = require('./shared');
const { setCache, getObj, execMulti, execPipeline, hGetAll, hGetAllObj } = require('./cache');
const { getPerson } = require('./persons');
let sectionsData = require('./sections_data');
const { batchUpdate } = require('./db');

function addMeSection(person_token, section_key, location) {
    function addDataToSection(section) {
        return new Promise(async (resolve, reject) => {
            if (section_key in sectionsData) {
                let fnData = sectionsData[section_key].functions.data;
                let fnFilterList = sectionsData[section_key].functions.filterList;

                try {
                    let country = await latLonLookup(location?.lat, location?.lon);

                    if (fnData) {
                        section.data = await module.exports[fnData](country);
                    }

                    if (fnFilterList) {
                        section.data = await module.exports[fnFilterList]();
                    }
                } catch(e) {
                    console.error(e);
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

function addMeSectionItem(person_token, section_key, table_key, item_token, hash_key) {
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

            let cacheObj = sectionData.cacheKeys?.[table_key];

            if (fnAll) {
                options = await module.exports[fnAll]();
                section_option = options.byToken[item_token];
            } else if (cacheObj?.byHash) {
                let cache_key = cacheObj.byHash;
                section_option = await cacheService.hGetItem(cache_key, item_token);
            } else if (cacheObj?.byHashKey) {
                let cache_key = cacheObj.byHashKey(hash_key);
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

                    if(userTableData.cols.hashKey) {
                        insert_data[userTableData.cols.hashKey] = section_option[sectionData.autoComplete.filter.hashKey];
                    }

                    insert_data[userTableData.cols.id] = section_option.id;

                    let [id] = await conn(userTableData.name).insert(insert_data);

                    insert_data.id = id;

                    item_data = insert_data;
                }

                item_data.table_key = table_key;

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
            } else {
                return reject("Item already exists in section");
            }
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function updateMeSectionItem(body) {
    return new Promise(async (resolve, reject) => {
        if(typeof body !== 'object') {
            return reject('No body');
        }

        const { person_token, section_key, table_key, section_item_id,
                favorite, secondary, is_delete
        } = body;

        const validateRequiredFields = () => {
            if (!person_token || !section_key || !section_item_id || !table_key) {
                return reject('Missing required fields');
            }
        };

        const validateUpdateFields = () => {
            const updates = { favorite, secondary, is_delete };
            if (!Object.values(updates).some(val => val !== undefined)) {
                return reject('No valid update fields provided');
            }
        };

        const validateFavoriteField = () => {
            if (typeof favorite === 'undefined') return;

            if (typeof favorite !== 'object') {
                return reject('Favorite must be an object');
            }

            const validFields = ['active', 'position', 'reorder'];
            const hasValidField = Object.keys(favorite).some(key => validFields.includes(key));

            if (!hasValidField) {
                return reject('Invalid favorite fields');
            }
        };

        const getSection = () => {
            const sectionData = sectionsData[section_key];
            if (!sectionData) return reject('Section not found');

            const userTableData = sectionData.tables?.[table_key]?.user;
            if (!userTableData) return reject('Invalid table key');

            return { sectionData, userTableData };
        };

        const handleReorderUpdate = (cache_data, userTableData) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const batch_updates = [];
                    const now = timeNow();

                    let mainItemUpdate = {
                        id: section_item_id,
                        updated: now
                    };

                    if(is_delete) {
                        mainItemUpdate.is_favorite = false;
                        mainItemUpdate.favorite_position = null;
                        mainItemUpdate.deleted = now;
                        batch_updates.push(mainItemUpdate);
                        updateCacheItem(cache_data, mainItemUpdate,  section_item_id);
                    } else if(typeof favorite.active !== 'undefined') {
                        mainItemUpdate.is_favorite = favorite.active;
                        mainItemUpdate.favorite_position = isNumeric(favorite.position) ? favorite.position : null;
                        mainItemUpdate.deleted = null;
                        batch_updates.push(mainItemUpdate);
                        updateCacheItem(cache_data, mainItemUpdate,  section_item_id);
                    }

                    // Handle reorder updates
                    for (const [token, reorder_item] of Object.entries(favorite.reorder)) {
                        const update = {
                            id: reorder_item.id,
                            is_favorite: isNumeric(reorder_item.favorite_position),
                            favorite_position: isNumeric(reorder_item.favorite_position) ? reorder_item.favorite_position : null,
                            updated: now,
                            deleted: null
                        };
                        batch_updates.push(update);
                        updateCacheItem(cache_data, update, null, token);
                    }

                    await batchUpdate(userTableData.name, batch_updates);

                    resolve();
                } catch(e) {
                    console.error(e);
                    return reject();
                }
            });
        };

        const handleRegularUpdate = (cache_data, userTableData, person) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const now = timeNow();
                    const data = { updated: now };

                    if (is_delete) {
                        data.deleted = now;
                    } else {
                        if (secondary !== undefined) {
                            data[userTableData.cols.secondary] = secondary;
                        }
                        if (favorite !== undefined) {
                            if (typeof favorite.active !== 'undefined') {
                                data.is_favorite = favorite.active;
                            }
                            if (typeof favorite.position !== 'undefined') {
                                data.favorite_position = favorite.position;
                            }
                        }
                    }

                    const conn = await dbService.conn();
                    const update = await conn(userTableData.name)
                        .where('id', section_item_id)
                        .where('person_id', person.id)
                        .update(data);

                    if (update === 1 && cache_data) {
                        updateCacheItem(cache_data, data, section_item_id);
                    }

                    resolve();
                } catch(e) {
                    console.error(e);
                    return reject();
                }
            });
        };

        const updateCacheItem = (cache_data, data, id = null, token = null) => {
            if (!cache_data) return;

            const targetItem = token ?
                cache_data[token] :
                Object.values(cache_data).find(item => item.id === id);

            if (targetItem) {
                Object.assign(targetItem, data);
            }
        };

        try {
            // Validate inputs
            validateRequiredFields();
            validateUpdateFields();
            validateFavoriteField();

            // Get section data
            const { userTableData } = getSection();
            const person = await getPerson(body.person_token);
            if (!person) return reject('Person not found');

            // Get cache data
            const cache_key = cacheService.keys.person_sections_data(
                person.person_token,
                body.section_key
            );
            const cache_data = await cacheService.getObj(cache_key);

            // Handle updates
            if (body.favorite?.reorder && Object.keys(body.favorite.reorder).length) {
                await handleReorderUpdate(cache_data, userTableData);
            } else {
                await handleRegularUpdate(cache_data, userTableData, person);
            }

            // Update cache if data exists
            if (cache_data) {
                await cacheService.setCache(cache_key, cache_data);
            }

            resolve();
        } catch (error) {
            console.error(error);
            reject(error);
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
                    let hash_key_col = userTableData.cols.hashKey;

                    for (let item of qry) {
                        let section_option;

                        item.table_key = table_key;

                        let cacheObj = sectionData.cacheKeys?.[table_key];

                        if (options) {
                            section_option = options.byId[item[col_name]];
                        } else if (cacheObj?.byHash) {
                            let cache_key = cacheObj.byHash;

                            section_option = await cacheService.hGetItem(cache_key, item[token_col]);
                        } else if (cacheObj?.byHashKey) {
                            let cache_key = cacheObj.byHashKey(item[hash_key_col]);

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

function getMeSections(person, country) {
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
            organized.active = await getActiveData(person, organized.active, country);

            return resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getActiveData(person, sections, country) {
    return new Promise(async (resolve, reject) => {
        let section_keys = Object.keys(sections);

        if (!section_keys?.length) {
            return resolve({});
        }

        let missing_keys = {};
        let multi = cacheService.startPipeline();

        try {
            // Get data from cache in batch
            for (let key of section_keys) {
                if (!(key in sectionsData)) {
                    continue;
                }

                const section = sectionsData[key];

                if (section.categories?.cacheKeys) {
                    // Items
                    if (section.categories.cacheKeys.items?.key) {
                        multi.get(section.categories.cacheKeys.items.key);
                    }
                }

                // Always get person-specific items
                const cache_key_items = cacheService.keys.person_sections_data(
                    person.person_token,
                    key
                );

                multi.get(cache_key_items);
            }

            let results = await execPipeline(multi);

            let resultIndex = 0;

            // Process results
            for (let section_key of section_keys) {
                if (!(section_key in sectionsData)) {
                    continue;
                }

                const section = sectionsData[section_key];
                let categoryOptions = null;
                let categoryItems = null;
                let filterList = null;
                let items = null;

                // Get category items
                if (section.categories?.cacheKeys) {
                    if (section.categories.cacheKeys.items?.key) {
                        categoryItems = results[resultIndex++];
                        try {
                            categoryItems = JSON.parse(categoryItems);
                        } catch (e) {}
                    }
                }

                // Get category options
                if(section?.categories?.fn) {
                    if(section_key === 'music') {
                        let sectionCategories = categoryOptions = await module.exports[section.categories.fn](country);

                        categoryOptions = sectionCategories.options;
                        categoryItems = sectionCategories.items;
                    }
                }

                // Get filter list
                if (section.functions?.filterList) {
                    filterList = await module.exports[section.functions.filterList]();
                }

                // Get person items
                items = results[resultIndex++];
                try {
                    items = JSON.parse(items);
                } catch (e) {}

                // Build section data
                if (categoryOptions || categoryItems || filterList) {
                    sections[section_key].data = {
                        myStr: section.myStr || null,
                        tabs: section.tabs || null,
                        options: categoryItems,
                        autoComplete: section.autoComplete,
                        categories: {
                            endpoint: section.categories?.endpoint || null,
                            options: section.categories?.options || categoryOptions || null
                        },
                        secondary: section.secondary || null,
                        styles: section.styles || null,
                        tables: Object.keys(section.tables).reduce((acc, key) => {
                            acc.push({
                                name: key,
                                isFavorable: !!section.tables[key].isFavorable
                            });

                            return acc;
                        }, []),
                    };

                    sections[section_key].items = items || {};
                } else {
                    missing_keys[section_key] = 1;
                }
            }

            // Handle missing data
            for (let key in missing_keys) {
                if (sectionsData[key].functions?.data) {
                    let data = await module.exports[sectionsData[key].functions.data]();
                    let items = await getPersonSectionItems(person, key);

                    sections[key].data = data;
                    sections[key].items = items;
                }
            }

            // Clean up items
            for (let key in sections) {
                let section = sections[key];
                if (section.items) {
                    for (let token in section.items) {
                        let item = section.items[token];
                        delete item.created;
                        delete item.updated;
                        if (item.deleted) {
                            delete section.items[token];
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error in getActiveData:', e);
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
                categories: {
                    options: section.categories.options
                },
                secondary: section.secondary,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                            name: key,
                            isFavorable: !!section.tables[key].isFavorable
                        });

                    return acc;
                }, []),
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

function getMusic(country) {
    return new Promise(async (resolve, reject) => {
        try {
            let section = sectionsData.music;

            //categories
            let categoryData = await getCategoriesMusic(country);

            let data = {
                myStr: section.myStr,
                tabs: section.tabs,
                options: categoryData.items,
                autoComplete: section.autoComplete,
                categories: {
                    endpoint: section.categories.endpoint,
                    options: categoryData.options,
                },
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        isFavorable: section.tables[key].isFavorable
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}


function getSchools() {
    return new Promise(async (resolve, reject) => {
        //list of countries for autocomplete
        try {
            let section = sectionsData.schools;

            let data = {
                myStr: section.myStr,
                autoComplete: section.autoComplete,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        isFavorable: section.tables[key].isFavorable
                    });

                    return acc;
                }, []),
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

function getCategoriesMusic(country) {
    return new Promise(async (resolve, reject) => {
        let section = sectionsData.music;

        let code = country?.code || section.categories.defaultCountry;

        // code = 'CA';

        try {
             let allGenres = await hGetAllObj(cacheService.keys.music_genres);
             let countryGenres = await hGetAllObj(cacheService.keys.music_genres_country(code));

             let categoryGenres = [];

             for(let k in countryGenres) {
                 if(allGenres[k].is_active) {
                     categoryGenres.push({
                         table_key: 'artists',
                         heading: 'Artists',
                         name: allGenres[k].name,
                         position: countryGenres[k].position,
                         token: k,
                     });
                 }
             }

             categoryGenres.sort((a, b) => {
                 return a.position - b.position;
             });

             let categories = [
                 {
                     table_key: 'genres',
                     name: 'Genres',
                 },
                 ...categoryGenres
             ];

             let genres = [
                 ...categoryGenres
             ];

             for(let k in allGenres) {
                 let genre = allGenres[k];

                 if(genre.is_featured) {
                     genres.push({
                         name: genre.name,
                         token: genre.token,
                     });
                 }
             }

             genres.map(item => {
                item.category = 'genres';
             });

             resolve({
                 options: categories,
                 items: genres
             });
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    sections: sectionsData,
    addMeSection,
    deleteMeSection,
    addMeSectionItem,
    updateMeSectionItem,
    getPersonSectionItems,
    getAllMeSections,
    getMeSections,
    getActiveData,
    dataForSchema,
    getInstruments,
    allInstruments,
    getMusic,
    getSchools,
    getCategoriesMusic
};
