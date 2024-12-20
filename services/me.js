const cacheService = require('../services/cache');
const dbService = require('../services/db');
const modesService = require('../services/modes');
const lifeStagesService = require('../services/life_stages');
const relationshipService = require('../services/relationships');
const politicsService = require('../services/politics');
const religionsService = require('../services/religion');
const drinkingService = require('../services/drinking');
const smokingService = require('../services/smoking');
let sectionsData = require('../services/sections_data');

const { isNumeric, timeNow, generateToken } = require('../services/shared');
const { setCache, getObj, execPipeline, hGetAllObj } = require('../services/cache');
const { batchUpdate } = require('../services/db');
const { getCountries } = require('../services/locations');
const { getLanguagesCountry } = require('../services/languages');
const { getPerson, updatePerson } = require('../services/persons');

function putModes(person_token, modes) {
    return new Promise(async (resolve, reject) => {
        try {
            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            let allModes = await modesService.getModes();

            if (!modes || !Array.isArray(modes) || !modes.every(mode => mode in allModes.byToken)) {
                return reject('Invalid mode');
            }

            await updatePerson(person_token, {
                modes
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
        resolve();
    });
}

function putPartner(person_token, gender_token, is_select) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.person(person_token);
            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            let genders = await getGenders(true);

            let gender = genders.find((x) => x.token === gender_token);

            if (!gender) {
                return reject('Gender not found');
            }

            //init cache
            if (!('modes' in person)) {
                person.modes = {};
            }

            if (!('partner' in person.modes)) {
                person.modes.partner = {};
            }

            let conn = await dbService.conn();

            //check if record exists
            let check = await conn('persons_partner').where('person_id', person.id).first();

            if (check) {
                let updateData = {};

                if (is_select) {
                    updateData.gender_id = gender.id;
                    updateData.updated = timeNow();
                    updateData.deleted = null;
                } else {
                    updateData.gender_id = null;
                    updateData.updated = timeNow();
                }

                await conn('persons_partner').where('id', check.id).update(updateData);

                Object.assign(person.modes.partner, updateData);
            } else {
                let token = generateToken(12);

                let createData = {
                    person_id: person.id,
                    gender_id: gender.id,
                    token: token,
                    created: timeNow(),
                    updated: timeNow(),
                };

                let [id] = await conn('persons_partner').insert(createData);

                createData.id = id;

                Object.assign(person.modes.partner, createData);
            }

            await setCache(cache_key, person);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
        resolve();
    });
}

function addKid(person_token) {
    return new Promise(async (resolve, reject) => {
        try {
            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            let conn = await dbService.conn();

            // Generate new kid
            let kid = {
                token: generateToken(12),
                person_id: person.id,
                is_active: true,
                created: timeNow(),
                updated: timeNow(),
            };

            let [id] = await conn('persons_kids').insert(kid);
            kid.id = id;

            // Update cache
            const cache_key = cacheService.keys.person(person.person_token);
            let cached_kids = person.modes?.kids || {};

            cached_kids[kid.token] = {
                token: kid.token,
                gender_id: null,
                age_id: null,
                is_active: true,
            };

            if (!('modes' in person)) {
                person.modes = {};
            }

            if (!('kids' in person.modes)) {
                person.modes.kids = {};
            }

            person.modes.kids = cached_kids;

            await cacheService.setCache(cache_key, person);

            resolve(kid);
        } catch (e) {
            return reject(e);
        }
    });
}

function updateKid(
    person_token,
    kid_token,
    age_token = null,
    gender_token = null,
    is_select = null,
    is_active = null,
) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.person(person_token);
            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            if (!kid_token) {
                return reject('Kid token required');
            }

            let conn = await dbService.conn();

            // Get kid
            let kid = await conn('persons_kids')
                .where('token', kid_token)
                .where('person_id', person.id)
                .first();

            if (!kid) {
                return reject('Kid not found');
            }

            // Get age and gender records if tokens provided
            let age_id = null;
            let gender_id = null;

            let ages = await getObj(cacheService.keys.kids_ages);

            if (ages?.[age_token]) {
                let age = ages[age_token];

                if (age) {
                    age_id = age.id;
                }
            }

            if (gender_token) {
                let genders = await getGenders(true);

                if (genders) {
                    let gender = genders.find((x) => x.token === gender_token);

                    if (gender) {
                        gender_id = gender.id;
                    }
                }
            }

            // Update DB
            const updates = {
                updated: timeNow(),
            };

            if (age_id !== null) {
                updates.age_id = age_id;
            }

            if (gender_id !== null) {
                if (is_select) {
                    updates.gender_id = gender_id;
                } else {
                    updates.gender_id = null;
                }
            }

            if (is_active !== null) {
                updates.is_active = is_active;
            }

            await conn('persons_kids').where('id', kid.id).update(updates);

            // Update cache
            let cached_kids = person?.modes?.kids || {};

            if (cached_kids[kid_token]) {
                if (age_id !== null) {
                    cached_kids[kid_token].age_id = age_id;
                }
                if (gender_id !== null) {
                    if (is_select) {
                        cached_kids[kid_token].gender_id = gender_id;
                    } else {
                        cached_kids[kid_token].gender_id = null;
                    }
                }
                if (is_active !== null) {
                    cached_kids[kid_token].is_active = is_active;
                }

                if (!('modes' in person)) {
                    person.modes = {};
                }

                if (!('kids' in person.modes)) {
                    person.modes.kids = {};
                }

                person.modes.kids = cached_kids;

                await cacheService.setCache(cache_key, person);
            }
        } catch (e) {
            return reject(e);
        }

        resolve();
    });
}

function removeKid(person_token, kid_token) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.person(person_token);
            let person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            if (!kid_token) {
                return reject('Kid token required');
            }

            let conn = await dbService.conn();

            // Soft delete in DB
            await conn('persons_kids')
                .where('token', kid_token)
                .where('person_id', person.id)
                .update({
                    deleted: timeNow(),
                    updated: timeNow(),
                });

            // Update cache
            let cached_kids = person?.modes?.kids;

            if (cached_kids) {
                delete cached_kids[kid_token];
                person.modes.kids = cached_kids;
                await cacheService.setCache(cache_key, person);
            }
        } catch (e) {
            console.error(e);
            return reject('Error deleting kid');
        }

        resolve();
    });
}

function addSection(person_token, section_key) {
    let person;

    function addDataToSection(section) {
        return new Promise(async (resolve, reject) => {
            if (section_key in sectionsData) {
                let sectionData = sectionsData[section_key];
                let fnData = sectionData.functions.data;
                let fnFilterList = sectionData.functions.filterList;

                try {
                    if (fnData) {
                        section.data = await module.exports[fnData]({
                            country_code: person.country_code,
                        });
                    }

                    if (fnFilterList) {
                        section.data = await module.exports[fnFilterList]();
                    }
                } catch (e) {
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
            person = await getPerson(person_token);

            if (!person) {
                return reject('No person found');
            }

            let conn = await dbService.conn();
            let cache_key = cacheService.keys.person_sections(person.person_token);

            let all_sections = await getAllSections();

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

function deleteSection(person_token, section_key) {
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

            let all_sections = await getAllSections();

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

function addSectionItem(person_token, section_key, table_key, item_token, hash_key) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!section_key) {
                return reject('Section key required');
            }

            if (!table_key) {
                return reject('Table key required');
            }

            if (!item_token) {
                return reject('Item token required');
            }

            let sectionData = sectionsData[section_key];

            if (!sectionData) {
                return reject('Invalid section key');
            }

            let userTableData = sectionData.tables[table_key]?.user;

            if (!userTableData) {
                return reject('Invalid table key');
            }

            let fnAll = sectionData.functions.all;

            let options = null;

            let conn = await dbService.conn();

            let person = await getPerson(person_token);

            if (!person) {
                return reject('No person found');
            }

            let me_sections = await getAllSections();

            let this_section = me_sections.find((section) => section.section_key === section_key);

            if (!this_section) {
                return reject('Section not found');
            }

            let section_option;

            let cacheObj = sectionData.cacheKeys?.[table_key];

            if (fnAll) {
                options = await module.exports[fnAll]();
                section_option = options.byToken[item_token];
                section_option = structuredClone(section_option);
            } else if (cacheObj?.byHash) {
                let cache_key = cacheObj.byHash;
                section_option = await cacheService.hGetItem(cache_key, item_token);
            } else if (cacheObj?.byHashKey) {
                let cache_key = cacheObj.byHashKey(hash_key);
                section_option = await cacheService.hGetItem(cache_key, item_token);
            }

            if (!section_option) {
                //todo search other tables in section for item
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

                    if (userTableData.cols.token) {
                        insert_data[userTableData.cols.token] = section_option.token;
                    }

                    if (userTableData.cols.hashKey) {
                        insert_data[userTableData.cols.hashKey] =
                            section_option[sectionData.autoComplete.filter.hashKey];
                    }

                    insert_data[userTableData.cols.id] = section_option.id;

                    let [id] = await conn(userTableData.name).insert(insert_data);

                    insert_data.id = id;

                    item_data = insert_data;
                }

                item_data.table_key = table_key;

                delete section_option.id;

                section_items[item_token] = {
                    id: item_data.id,
                    [userTableData.cols.id]: item_data[userTableData.cols.id],
                    ...(section_option.name && { name: section_option.name }),
                    token: item_token,
                    table_key: table_key,
                    created: item_data.created,
                    updated: item_data.updated,
                };

                let cache_key = cacheService.keys.persons_section_data(
                    person.person_token,
                    section_key,
                );

                await cacheService.setCache(cache_key, section_items);

                return resolve({
                    ...section_option,
                    ...item_data,
                });
            } else {
                return reject('Item already exists in section');
            }
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function updateSectionItem(body) {
    return new Promise(async (resolve, reject) => {
        if (typeof body !== 'object') {
            return reject('No body');
        }

        const {
            person_token,
            section_key,
            table_key,
            section_item_id,
            favorite,
            secondary,
            is_delete,
        } = body;

        const validateRequiredFields = () => {
            if (!person_token || !section_key || !section_item_id || !table_key) {
                return reject('Missing required fields');
            }
        };

        const validateUpdateFields = () => {
            const updates = { favorite, secondary, is_delete };
            if (!Object.values(updates).some((val) => val !== undefined)) {
                return reject('No valid update fields provided');
            }
        };

        const validateFavoriteField = () => {
            if (typeof favorite === 'undefined') return;

            if (typeof favorite !== 'object') {
                return reject('Favorite must be an object');
            }

            const validFields = ['active', 'position', 'reorder'];
            const hasValidField = Object.keys(favorite).some((key) => validFields.includes(key));

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
                        updated: now,
                    };

                    if (is_delete) {
                        mainItemUpdate.is_favorite = false;
                        mainItemUpdate.favorite_position = null;
                        mainItemUpdate.deleted = now;
                        batch_updates.push(mainItemUpdate);
                        updateCacheItem(cache_data, mainItemUpdate, section_item_id);
                    } else if (typeof favorite.active !== 'undefined') {
                        mainItemUpdate.is_favorite = favorite.active;
                        mainItemUpdate.favorite_position = isNumeric(favorite.position)
                            ? favorite.position
                            : null;
                        mainItemUpdate.deleted = null;
                        batch_updates.push(mainItemUpdate);
                        updateCacheItem(cache_data, mainItemUpdate, section_item_id);
                    }

                    // Handle reorder updates
                    for (const [token, reorder_item] of Object.entries(favorite.reorder)) {
                        const update = {
                            id: reorder_item.id,
                            is_favorite: isNumeric(reorder_item.favorite_position),
                            favorite_position: isNumeric(reorder_item.favorite_position)
                                ? reorder_item.favorite_position
                                : null,
                            updated: now,
                            deleted: null,
                        };
                        batch_updates.push(update);
                        updateCacheItem(cache_data, update, null, token);
                    }

                    await batchUpdate(userTableData.name, batch_updates);

                    resolve();
                } catch (e) {
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

                    let section = getSection();

                    if (is_delete) {
                        data.deleted = now;

                        //only update these columns if table is favorable
                        if (section.sectionData.tables?.[table_key]?.isFavorable) {
                            data.is_favorite = false;
                            data.favorite_position = null;
                        }
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
                        let targetItem;

                        for (let k in cache_data) {
                            let item = cache_data[k];

                            if (table_key && table_key !== item.table_key) {
                                continue;
                            }

                            if (item.id === section_item_id) {
                                targetItem = item;
                                break;
                            }
                        }

                        if (targetItem) {
                            if (is_delete) {
                                const itemToken = targetItem.token;
                                delete cache_data[itemToken];
                            } else {
                                // For update, merge new data
                                Object.assign(targetItem, data);
                            }
                        }
                    }

                    resolve();
                } catch (e) {
                    console.error(e);
                    return reject();
                }
            });
        };

        const updateCacheItem = (cache_data, data, id = null, token = null) => {
            if (!cache_data) return;

            const targetItem = token
                ? cache_data[token]
                : Object.values(cache_data).find((item) => item.id === id);

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
            const cache_key = cacheService.keys.persons_section_data(
                person.person_token,
                body.section_key,
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

function selectSectionOptionItem(person_token, section_key, table_key, item_token, is_select) {
    return new Promise(async (resolve, reject) => {
        try {
            // Input validation
            if (
                !person_token ||
                !section_key ||
                !table_key ||
                !item_token ||
                typeof is_select !== 'boolean'
            ) {
                return reject('Missing required fields');
            }

            // Get person and validate section
            const person = await getPerson(person_token);
            if (!person) {
                return reject('Person not found');
            }

            const sectionData = sectionsData[section_key];
            if (sectionData?.type?.name !== 'buttons') {
                return reject('Invalid section type');
            }

            const userTableData = sectionData.tables[table_key]?.user;
            if (!userTableData) {
                return reject('Invalid table configuration');
            }

            // Validate item token exists in options
            const options = await module.exports[sectionData.functions.data]({
                options_only: true,
            });
            if (!options) {
                return reject('Options not found');
            }

            const itemOption = options.find((option) => option.token === item_token);
            if (!itemOption) {
                return reject('Invalid item token');
            }

            // Setup common variables
            const conn = await dbService.conn();
            const now = timeNow();
            const person_id_col = userTableData?.cols?.person_id || 'person_id';
            const cache_key = cacheService.keys.persons_section_data(person_token, section_key);
            let cache_data = (await cacheService.getObj(cache_key)) || {};
            let response_data = null;

            // Get existing selection
            const existing = await conn(userTableData.name)
                .where(person_id_col, person.id)
                .where(userTableData.cols.id, itemOption.id)
                .first();

            // Handle Single Select or Exclusive Options
            if (
                sectionData.type.single ||
                (sectionData.type.exclusive && item_token === sectionData.type.exclusive.token)
            ) {
                if (existing) {
                    // Update existing record
                    await conn(userTableData.name)
                        .where('id', existing.id)
                        .update({
                            deleted: is_select ? null : now,
                            updated: now,
                        });

                    if (is_select) {
                        response_data = {
                            id: existing.id,
                            token: item_token,
                            name: itemOption.name,
                            created: existing.created,
                            updated: now,
                            deleted: null,
                        };
                    }
                } else if (is_select) {
                    // Create new record
                    const [id] = await conn(userTableData.name).insert({
                        person_id: person.id,
                        [userTableData.cols.id]: itemOption.id,
                        created: now,
                        updated: now,
                    });

                    response_data = {
                        id,
                        token: item_token,
                        name: itemOption.name,
                        created: now,
                        updated: now,
                    };
                }

                // Clear all other selections for single/exclusive
                if (response_data) {
                    await conn(userTableData.name)
                        .where(person_id_col, person.id)
                        .whereNot('id', response_data.id)
                        .update({
                            deleted: now,
                            updated: now,
                        });

                    // Update cache for single select
                    cache_data = {};
                    if (is_select) {
                        cache_data[item_token] = response_data;
                    }
                }
            }
            // Handle Multi Select
            else {
                if (existing) {
                    // Update existing record
                    await conn(userTableData.name)
                        .where('id', existing.id)
                        .update({
                            deleted: is_select ? null : now,
                            updated: now,
                        });

                    if (is_select) {
                        response_data = {
                            id: existing.id,
                            token: item_token,
                            name: itemOption.name,
                            created: existing.created,
                            updated: now,
                        };
                    }
                } else if (is_select) {
                    // Create new multi-select record
                    const [id] = await conn(userTableData.name).insert({
                        person_id: person.id,
                        [userTableData.cols.id]: itemOption.id,
                        created: now,
                        updated: now,
                    });

                    response_data = {
                        id,
                        token: item_token,
                        name: itemOption.name,
                        created: now,
                        updated: now,
                    };
                }

                // Handle exclusive option interactions
                if (is_select && sectionData.type.exclusive) {
                    if (item_token !== sectionData.type.exclusive.token) {
                        // Deselect exclusive option if selecting something else
                        const exclusiveOption = options.find(
                            (opt) => opt.token === sectionData.type.exclusive.token,
                        );
                        if (exclusiveOption) {
                            await conn(userTableData.name)
                                .where(person_id_col, person.id)
                                .where(userTableData.cols.id, exclusiveOption.id)
                                .update({
                                    deleted: now,
                                    updated: now,
                                });
                            delete cache_data[sectionData.type.exclusive.token];
                        }
                    } else {
                        // Deselect all other options if selecting exclusive
                        await conn(userTableData.name)
                            .where(person_id_col, person.id)
                            .whereNot('id', response_data.id)
                            .update({
                                deleted: now,
                                updated: now,
                            });
                        cache_data = {};
                    }
                }

                // Update cache for multi-select
                if (is_select && response_data) {
                    cache_data[item_token] = response_data;
                } else if (!is_select) {
                    delete cache_data[item_token];
                }
            }

            // Update cache with final data
            await cacheService.setCache(cache_key, cache_data);

            resolve(response_data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updateSectionPositions(person_token, positions) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!person_token || !positions) {
                return reject('Missing required fields');
            }

            if (typeof positions !== 'object' || !Object.keys(positions).length) {
                return reject('Invalid positions');
            }

            const person = await getPerson(person_token);

            if (!person) {
                return reject('Person not found');
            }

            //person sections
            let person_sections_cache_key = cacheService.keys.person_sections(person.person_token);

            let person_sections = await cacheService.getObj(person_sections_cache_key);

            let batch_update = [];

            for (let key in positions) {
                if (!(key in person_sections)) {
                    continue;
                }

                let prevData = person_sections[key];

                let data = positions[key];

                if (data.position === prevData.position) {
                    continue;
                }

                prevData.position = data.position;
                prevData.updated = timeNow();

                batch_update.push({
                    id: prevData.id,
                    position: data.position,
                    updated: timeNow(),
                });
            }

            if (!batch_update.length) {
                return resolve();
            }

            await batchUpdate('persons_sections', batch_update);

            await cacheService.setCache(person_sections_cache_key, person_sections);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function getPersonSectionItems(person, section_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.persons_section_data(
                person.person_token,
                section_key,
            );

            let organized = await cacheService.getObj(cache_key);

            let sectionData = sectionsData[section_key];

            if (!sectionData) {
                return resolve({});
            }

            if (!organized) {
                let fnAll = sectionData?.functions?.all;

                let options;

                if (fnAll) {
                    options = await module.exports[fnAll]();
                }

                organized = {};

                let conn = await dbService.conn();

                for (let table_key in sectionData.tables) {
                    let userTableData = sectionData.tables[table_key]?.user;

                    let person_id_col = userTableData?.cols?.person_id || 'person_id';

                    let qry = await conn(userTableData.name)
                        .where(person_id_col, person.id)
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
                            section_option = await cacheService.hGetItem(
                                cache_key,
                                item[token_col],
                            );
                        } else if (cacheObj?.byHashKey) {
                            let cache_key = cacheObj.byHashKey(item[hash_key_col]);
                            section_option = await cacheService.hGetItem(
                                cache_key,
                                item[token_col],
                            );
                        } else if (sectionData.type?.name === 'buttons') {
                            // For button-type sections
                            let allOptions = await module.exports[sectionData.functions.data]({
                                country_code: person.country_code,
                                options_only: true,
                            });
                            section_option = allOptions.find((opt) => opt.id === item[col_name]);
                        }

                        if (!section_option) {
                            continue;
                        }

                        if (secondary_col_name) {
                            item.secondary = item[secondary_col_name];
                        }

                        let itemKey = section_option.token || `option_${section_option.id}`;

                        if (table_key === 'genders') {
                            organized[itemKey] = {
                                id: item.id,
                                token: section_option.token,
                                name: section_option.name,
                                gender_id: item.gender_id,
                            };
                        } else {
                            organized[itemKey] = {
                                ...section_option,
                                ...item,
                            };
                        }
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

function getAllSections() {
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

function getSections(person) {
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
            let all_me_sections = await getAllSections();

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

            // Set genders automatically if:
            // 1. Not in active sections
            // 2. Not previously deleted
            if (!('genders' in organized.active)) {
                const wasDeleted = person_sections['genders']?.deleted;

                if (!wasDeleted) {
                    // Get the genders section data
                    const gendersSection = me_dict.byKey['genders'];

                    if (gendersSection) {
                        // Create new section record
                        const newSection = {
                            person_id: person.id,
                            section_id: gendersSection.id,
                            position: Object.keys(organized.active).length,
                            created: timeNow(),
                            updated: timeNow(),
                        };

                        // Insert into database
                        const [id] = await conn('persons_sections').insert(newSection);

                        newSection.id = id;

                        // Update cache
                        person_sections['genders'] = newSection;
                        await setCache(person_sections_cache_key, person_sections);

                        // Add to active sections and remove from options
                        organized.active['genders'] = newSection;
                        delete organized.options['genders'];
                    }
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
        let multi = cacheService.startPipeline();

        try {
            // Get data from cache in batch
            for (let key of section_keys) {
                if (!(key in sectionsData)) {
                    continue;
                }

                const section = sectionsData[key];

                if (section.categories?.cacheKeys?.items?.key) {
                    // Items
                    multi.get(section.categories.cacheKeys.items.key);
                }

                // Always get person-specific items
                const cache_key_items = cacheService.keys.persons_section_data(
                    person.person_token,
                    key,
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
                if (section.categories?.cacheKeys?.items?.key) {
                    categoryItems = results[resultIndex++];
                    try {
                        categoryItems = JSON.parse(categoryItems);
                    } catch (e) {
                        console.error(e);
                    }
                }

                // Get category options
                if (section?.categories?.fn) {
                    if (section_key === 'music') {
                        let sectionCategories = (categoryOptions = await module.exports[
                            section.categories.fn
                        ](person.country_code));

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
                            options: section.categories?.options || categoryOptions || null,
                        },
                        secondary: section.secondary || null,
                        styles: section.styles || null,
                        tables: Object.keys(section.tables).reduce((acc, key) => {
                            acc.push({
                                name: key,
                                isFavorable: !!section.tables[key].isFavorable,
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
                    let data = await module.exports[sectionsData[key].functions.data]({
                        country_code: person.country_code,
                    });
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

            if (cached_obj) {
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

function getDrinking(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await drinkingService.getDrinking();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.drinking;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getGenders(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let options_only;

            if (typeof params === 'boolean') {
                options_only = params;
            } else {
                options_only = params.options_only;
            }

            const cache_key = cacheService.keys.genders;
            let options = await cacheService.getObj(cache_key);

            if (!options) {
                let conn = await dbService.conn();

                options = await conn('genders')
                    .orderBy('sort_position')
                    .select('id', 'gender_token AS token', 'gender_name as name', 'is_visible');

                await cacheService.setCache(cache_key, options);
            }

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.genders;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getInstruments() {
    return new Promise(async (resolve, reject) => {
        try {
            if (module.exports.cache.instruments_common) {
                return resolve(module.exports.cache.instruments_common);
            }

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
                    options: section.categories.options,
                },
                secondary: section.secondary,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        isFavorable: !!section.tables[key].isFavorable,
                    });

                    return acc;
                }, []),
            };

            module.exports.cache['instruments_common'] = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function allInstruments() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.cache.instruments) {
            return resolve(module.exports.cache.instruments);
        }

        let cache_key = cacheService.keys.instruments;

        try {
            let data = await cacheService.getObj(cache_key);

            if (!data) {
                let conn = await dbService.conn();

                data = await conn('instruments').orderBy('popularity', 'desc');

                await cacheService.setCache(cache_key, data);
            }

            let organized = data.reduce(
                (acc, item) => {
                    acc.byId[item.id] = item;
                    acc.byToken[item.token] = item;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            module.exports.cache.instruments = organized;

            resolve(organized);
        } catch (e) {
            console.error(e);
        }
    });
}

function getMusic(country_code) {
    return new Promise(async (resolve, reject) => {
        try {
            if (module.exports.cache.music) {
                return resolve(module.exports.cache.music);
            }

            let section = sectionsData.music;

            //categories
            let categoryData = await getMusicCategories(country_code);

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
                        isFavorable: section.tables[key].isFavorable,
                    });

                    return acc;
                }, []),
            };

            module.exports.cache.music = data;

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
            if (module.exports.cache.schools) {
                return resolve(module.exports.cache.schools);
            }

            let section = sectionsData.schools;

            let data = {
                myStr: section.myStr || null,
                autoComplete: section.autoComplete,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        isFavorable: section.tables[key].isFavorable,
                    });

                    return acc;
                }, []),
            };

            let countries = (await getCountries()).list;

            countries.map((country) => {
                if (country.country_name && !country.name) {
                    country.name = country.country_name;
                }

                if (country.country_code && !country.code) {
                    country.code = country.country_code;
                }
            });

            data.autoComplete.filter.list = countries || [];

            module.exports.cache.schools = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getMusicCategories() {
    return new Promise(async (resolve, reject) => {
        try {
            let allGenres = await hGetAllObj(cacheService.keys.music_genres);

            let categoryGenres = [];

            for (let k in allGenres) {
                let genre = allGenres[k];

                if (genre.is_active) {
                    categoryGenres.push({
                        table_key: 'artists',
                        category: 'artists',
                        heading: 'Artists',
                        name: genre.name,
                        position: genre.position,
                        token: k,
                    });
                }
            }

            categoryGenres.sort((a, b) => {
                return a.position - b.position;
            });

            // Categories array
            let categories = [
                {
                    table_key: 'genres',
                    name: 'Genres',
                    category: 'genres',
                },
                ...categoryGenres,
            ];

            // Genre items
            let genres = [];
            for (let k in allGenres) {
                let genre = allGenres[k];

                if (genre.is_active) {
                    genres.push({
                        name: genre.name,
                        token: genre.token || k,
                        category: 'genres',
                        table_key: 'genres',
                        position: genre.position,
                    });
                }
            }

            genres.sort((a, b) => {
                return a.position - b.position;
            });

            resolve({
                options: categories,
                items: genres,
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getMovieCategories() {
    return new Promise(async (resolve, reject) => {
        try {
            let allGenres = await hGetAllObj(cacheService.keys.movie_genres);

            // Main categories
            let mainCategories = [
                {
                    table_key: 'genres',
                    name: 'Genres',
                },
                {
                    table_key: 'movies',
                    name: 'Popular',
                    token: 'popular',
                },
                {
                    table_key: 'movies',
                    name: 'New Releases',
                    token: 'new_releases',
                },
            ];

            // Process genres
            let genreCategories = [];
            let genreItems = [];

            // Build genre categories and items
            for (let k in allGenres) {
                let genre = allGenres[k];

                if (!genre.deleted) {
                    // Add to category options
                    genreCategories.push({
                        table_key: 'movies',
                        heading: 'Films',
                        name: genre.name,
                        token: `genre_${k}`,
                    });

                    // Add to items list
                    genreItems.push({
                        token: k,
                        name: genre.name,
                        category: 'genres',
                    });
                }
            }

            // Sort genre categories alphabetically
            genreCategories.sort((a, b) => a.name.localeCompare(b.name));

            // Build decade categories
            let decadeCategories = [];
            let currentYear = new Date().getFullYear();
            let currentDecade = Math.floor(currentYear / 10) * 10;

            for (let decade = currentDecade; decade >= 1930; decade -= 10) {
                let name = `${decade}s`;
                decadeCategories.push({
                    table_key: 'movies',
                    heading: 'Films',
                    name: name,
                    token: name,
                });
            }

            // Combine categories in specific order:
            // 1. Main categories (Genres, New Releases)
            // 2. Film genres (alphabetically)
            // 3. Decades (newest to oldest)
            const categories = [...mainCategories, ...genreCategories, ...decadeCategories];

            // Sort genre items alphabetically
            genreItems.sort((a, b) => a.name.localeCompare(b.name));

            resolve({
                options: categories,
                items: genreItems,
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getMovies() {
    return new Promise(async (resolve, reject) => {
        try {
            if (module.exports.cache.movies) {
                return resolve(module.exports.cache.movies);
            }

            let section = sectionsData.movies;

            // Get categories data
            let categoryData = await getMovieCategories();

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
                        isFavorable: section.tables[key].isFavorable,
                    });
                    return acc;
                }, []),
            };

            module.exports.cache.movies = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getLanguages(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only, country_code } = params;

            let options = await getLanguagesCountry(country_code);

            if (options_only) {
                return resolve(options);
            }

            // Build section data response
            const section = sectionsData.languages;
            const data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).map((key) => ({
                    name: key,
                })),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getLifeStages(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await lifeStagesService.getLifeStages();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.life_stages;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getPolitics(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await politicsService.getPolitics();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.politics;
            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({ name: key });
                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getReligions(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await religionsService.getReligions();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.religion;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getRelationshipStatus(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await relationshipService.getRelationshipStatus();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.relationships;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getSmoking(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { options_only } = params;

            let options = await smokingService.getSmoking();

            if (options_only) {
                return resolve(options);
            }

            let section = sectionsData.smoking;

            let data = {
                type: section.type,
                options: options,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                    });

                    return acc;
                }, []),
            };

            resolve(data);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getSports(params = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let { country_code } = params;

            if (module.exports.cache.sports) {
                if (country_code && module.exports.cache.sports[country_code]) {
                    return resolve(module.exports.cache.sports[country_code]);
                }
            }

            let section = sectionsData.sports;

            let categoryData = await getSportCategories(country_code);

            let data = {
                myStr: section.myStr,
                tabs: section.tabs,
                options: categoryData.items,
                autoComplete: section.autoComplete,
                categories: {
                    endpoint: section.categories.endpoint,
                    options: categoryData.options,
                },
                secondary: section.secondary,
                styles: section.styles,
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        isFavorable: section.tables[key].isFavorable,
                    });
                    return acc;
                }, []),
            };

            if (!module.exports.cache.sports) {
                module.exports.cache.sports = {};
            }

            module.exports.cache.sports[country_code] = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getSportCategories(country_code) {
    return new Promise(async (resolve, reject) => {
        try {
            let section = sectionsData.sports;
            let allSports = await cacheService.hGetAllObj(cacheService.keys.sports);
            country_code = country_code || section.categories.defaultCountry;

            const ordering = await cacheService.hGetAll(
                cacheService.keys.sports_country_order(country_code),
            );
            const topLeagues =
                (await cacheService.getObj(
                    cacheService.keys.sports_country_top_leagues(country_code),
                )) || [];

            // Separate team sports and play sports
            let categorySports = [];
            let playSports = [];

            for (let k in allSports) {
                let sport = allSports[k];

                //swap football/soccer for US/world
                if (sport.token === 'spo_amfo') {
                    if (country_code === 'US') {
                        sport.name = 'Football';
                    }
                } else if (sport.token === 'spo_socc') {
                    if (country_code !== 'US') {
                        sport.name = 'Football';
                    }
                }

                // Add to play sports if applicable
                if (sport.is_active && sport.is_play) {
                    playSports.push({
                        name: sport.name,
                        token: k,
                        is_play: sport.is_play,
                        position: ordering[k] || 999999,
                    });
                }

                // Add to team sports if applicable
                if (sport.is_active && sport.has_teams) {
                    const hasTeams = await cacheService.getObj(
                        cacheService.keys.sports_country_top_teams(k, country_code),
                    );

                    if (hasTeams && hasTeams.length) {
                        categorySports.push({
                            table_key: 'teams',
                            heading: 'Teams',
                            name: sport.name,
                            position: ordering[k] || 999999,
                            token: k,
                            is_play: sport.is_play,
                        });
                    }
                }
            }

            // Sort both arrays
            categorySports.sort((a, b) => a.position - b.position);
            playSports.sort((a, b) => a.position - b.position);

            // Build categories array
            let categories = [
                {
                    table_key: 'play',
                    name: 'Play',
                },
                {
                    table_key: 'leagues',
                    name: 'Leagues',
                },
                ...categorySports,
            ];

            // Build items array
            let items = [];

            // Add play sports to items
            for (let sport of playSports) {
                items.push({
                    ...sport,
                    category: 'play',
                });
            }

            // Add leagues to items
            const leagues = await cacheService.hGetAllObj(cacheService.keys.sports_leagues);

            if (leagues && topLeagues.length) {
                for (let index = 0; index < topLeagues.length; index++) {
                    const leagueData = leagues[topLeagues[index]];
                    if (leagueData) {
                        items.push({
                            name: leagueData.short_name || leagueData.name,
                            token: leagueData.token,
                            category: 'leagues',
                            position: index,
                        });
                    }
                }
            }

            // Sort items
            items.sort((a, b) => {
                if (a.category === b.category) {
                    if (a.category === 'leagues') {
                        return a.position - b.position;
                    }
                    return a.name.localeCompare(b.name);
                }
                return 0;
            });

            resolve({
                options: categories,
                items: items,
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getTvCategories() {
    return new Promise(async (resolve, reject) => {
        try {
            //todo cache
            let allGenres = await hGetAllObj(cacheService.keys.tv_genres);

            // Main categories
            let mainCategories = [
                {
                    table_key: 'genres',
                    name: 'Genres',
                },
                {
                    table_key: 'shows',
                    name: 'Most Popular',
                    token: 'popular',
                },
            ];

            // Networks
            const networkCategories = [
                {
                    image: `<svg class="netflix" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 426.9395 760.8679"><defs><style>.nflx-fox-cls-1{fill:url(#linear-gradient-2);}.nflx-fox-cls-2{fill:url(#linear-gradient);}.nflx-fox-cls-3{fill:#e41e26;}</style><linearGradient id="linear-gradient" x1="88.7425" y1="414.5588" x2="197.4576" y2="459.0375" gradientTransform="translate(-8.3622 786.0331) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b11f24"/><stop offset=".5461" stop-color="#7a1315"/><stop offset="1" stop-color="#e41e26" stop-opacity="0"/></linearGradient><linearGradient id="linear-gradient-2" x1="349.1547" y1="404.0257" x2="237.9731" y2="357.0835" gradientTransform="translate(-8.3622 786.0331) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b11f24"/><stop offset=".625" stop-color="#7a1315"/><stop offset="1" stop-color="#b11f24" stop-opacity="0"/></linearGradient></defs><path class="nflx-fox-cls-2" d="M0,0l2.6207,760.8679c55.54-10.696,99.213-9.5271,148.5049-13.9773V.8565L0,0Z"/><path class="nflx-fox-cls-1" d="M269.0648.8736h151.1276l1.7472,758.2908-153.7502-25.3335L269.0648.8736Z"/><path class="nflx-fox-cls-3" d="M1.7472.8736c3.4943,8.7358,262.0742,744.2908,262.0742,744.2908,42.4898-.3034,99.4631,6.6348,155.4936,13.1033L150.2521.8789l-148.5049-.0053Z"/></svg>`,
                    table_key: 'shows',
                    heading: 'Streaming',
                    name: 'Netflix',
                    token: 'netflix',
                },
                {
                    image: `<svg class="disney" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 360.8762 290.1867"><defs><style>.dsny-fox-cls-1{fill:none;}.dsny-fox-cls-2{fill:url(#radial-gradient);}.dsny-fox-cls-3{fill:#282d72;}</style><radialGradient id="radial-gradient" cx="207.4786" cy="182.2696" fx="207.4786" fy="182.2696" r=".5445" gradientTransform="translate(-8.3622 182.4693) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset=".007" stop-color="#2a3184"/><stop offset=".03" stop-color="#2b3287"/><stop offset=".057" stop-color="#2d3c97"/><stop offset=".084" stop-color="#35469d"/><stop offset=".111" stop-color="#37499f"/><stop offset=".138" stop-color="#364ca0"/><stop offset=".165" stop-color="#3952a3"/><stop offset=".191" stop-color="#3853a4"/><stop offset=".216" stop-color="#3d54a5"/><stop offset="1" stop-color="#6fccdd" stop-opacity="0"/></radialGradient></defs><g id="Layer_1-2"><g id="group"><g id="group-1"><g id="group-2"><path id="Path" class="dsny-fox-cls-3" d="M349.735,185.3c-1.9,24.2-11.2,64.9-77.1,85-43.5,13.1-84.6,6.8-107,1.1-.5,8.9-1.5,12.7-2.9,14.2-1.9,1.9-16.1,10.1-23.9-1.5-3.5-5.5-5.3-15.5-6.3-24.4-50.4-23.2-73.6-56.6-74.5-58.1-1.1-1.1-12.6-13.1-1.1-27.8,10.8-13.3,46.1-26.6,77.9-32,1.1-27.2,4.3-47.7,8.1-57.1,4.6-10.9,10.4-1.1,15.4,6.3,4.2,5.5,6.7,29.2,6.9,48.1,20.8-1,33.1.5,56.3,4.7,30.2,5.5,50.4,20.9,48.6,38.4-1.3,17.2-17.1,24.3-23.1,24.8-6.3.5-16.1-4-16.1-4-6.7-3.2-.5-6,7.6-9.5,8.8-4.3,6.8-8.7,6.8-8.7-3.3-9.6-42.5-16.3-81.5-16.3-.2,21.5.9,57.2,1.4,78,27.3,5.2,47.7,4.2,47.7,4.2,0,0,99.6-2.8,102.6-66.4,3.1-63.7-99.3-124.8-175-144.2-75.6-19.8-118.4-6-122.1-4.1-4,2-.3,2.6-.3,2.6,0,0,4.1.6,11.2,3,7.5,2.4,1.7,6.3,1.7,6.3-12.9,4.1-27.4,1.5-30.2-4.4-2.8-5.9,1.9-11.2,7.3-18.8,5.4-8,11.3-7.7,11.3-7.7,93.5-32.4,207.4,26.2,207.4,26.2,106.7,54.1,124.9,117.5,122.9,142.1ZM67.535,182c-10.6,5.2-3.3,12.7-3.3,12.7,19.9,21.4,44.4,34.8,67.7,43.1,2.7-36.9,2.3-49.9,2.6-68.5-36.4,2.5-57.4,8.3-67,12.7Z"/></g></g><g id="group-6"><g id="group-7"><path id="Path-2" class="dsny-fox-cls-1" d="M199.735.1h-.1M198.935.2c-.3,0-.6-.1-.9-.1.3.1.6.1.9.1h.3-.3ZM198.935.2c-.3,0-.6-.1-.9-.1.3.1.6.1.9.1h.3-.3Z"/><path id="Path-3" class="dsny-fox-cls-2" d="M198.935.2c-.3,0-.6-.1-.9-.2.3.1.6.2.9.2h.2-.2Z"/></g></g></g></g></svg>`,
                    table_key: 'shows',
                    heading: 'Streaming',
                    name: 'Disney+',
                    token: 'disney',
                },
                {
                    image: `<svg class="hbo" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 458.8364 141.1832"><defs><style>.hbo-fox-cls-1{fill:none;}.hbo-fox-cls-2{fill:url(#linear-gradient);}</style><linearGradient id="linear-gradient" x1="2615.5018" y1="-264.1994" x2="3120.2391" y2="-264.1994" gradientTransform="translate(-2377.6473 -169.5815) scale(.9091 -.9091)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7d50a0"/><stop offset=".399" stop-color="#5a4099"/><stop offset=".727" stop-color="#5a4099"/><stop offset="1" stop-color="#7d50a0"/></linearGradient></defs><path class="hbo-fox-cls-2" d="M187.1085,51.3326C186.3678,17.8516,162.6644.1482,133.6278.1482c-15.9257,0-30.2958,5.3333-40.0736,15.7035C83.7767,5.4814,69.4064.1482,53.4807.1482,24.4441.1482.7407,17.9257,0,51.4067v76.5915c0,7.0369,5.7036,12.6665,12.6666,12.6665h11.9998c1.1852,0,2.148-.9629,2.148-2.1481V51.5548h0c.5185-16.5183,12.222-25.2589,26.6663-25.2589s26.1478,8.7406,26.6663,25.2589h0v76.3693c0,7.0369,5.7036,12.6665,12.6666,12.6665h11.9998c1.1852,0,2.148-.9629,2.148-2.1481V51.4808h0c.5185-16.5183,12.222-25.2589,26.6663-25.2589s26.1478,8.7406,26.6663,25.2589h0v76.3693c0,7.0369,5.7036,12.6665,12.6666,12.6665h11.9998c1.1852,0,2.148-.9629,2.148-2.1481V51.4067c.0741.0741,0,0,0-.0741h.0002ZM457.2528,2.2963h-20.3701c-5.6296,0-10.8887,2.8148-14.0739,7.4814l-22.5181,33.3329c-2.9629,4.3703-9.3333,4.3703-12.2962,0l-22.5181-33.3329c-3.111-4.6666-8.4443-7.4814-14.0739-7.4814h-20.3701c-1.2592,0-1.9999,1.4074-1.3334,2.4444l40.1475,59.5547c2.8888,4.2962,2.8888,9.9258,0,14.222l-40.1475,59.5547c-.7407,1.037.0741,2.4444,1.3334,2.4444h20.3701c5.6296,0,10.8887-2.8148,14.0739-7.4814l22.5181-33.3329c2.9629-4.3703,9.3333-4.3703,12.2962,0l22.5181,33.3329c3.111,4.6666,8.4443,7.4814,14.0739,7.4814h20.3701c1.2592,0,1.9999-1.4074,1.3334-2.4444l-40.2217-59.4806c-2.8888-4.2962-2.8888-9.9258,0-14.222l40.1475-59.5547c.7407-1.037,0-2.5185-1.2592-2.5185h0ZM320.514,2.2963h-11.9998c-6.074,0-11.1851,4.2962-12.4443,9.9999C285.4034,4.1481,271.9961,0,257.5519,0,222.4413,0,193.9232,24.4441,193.9232,70.5916s28.444,70.5916,63.6287,70.5916c14.3701,0,27.6293-4.074,38.2957-12.0739.5926,6.4444,6,11.5554,12.6666,11.5554h11.9998c1.1852,0,2.148-.9629,2.148-2.1481V4.4444c-.0741-1.1852-.963-2.1481-2.148-2.1481ZM257.5519,114.9614c-20.9627,0-37.9995-15.3331-37.9995-44.2957s17.0368-44.2957,37.9995-44.2957,37.9995,15.3331,37.9995,44.2957-17.0368,44.2957-37.9995,44.2957Z"/><path class="hbo-fox-cls-1" d="M457.2528,2.2962h-20.3702c-5.6296,0-10.8886,2.8148-14.0737,7.4814l-22.5183,33.3329c-2.9629,4.3703-9.3332,4.3703-12.2961,0l-22.5181-33.3329c-3.1111-4.6666-8.4443-7.4814-14.0739-7.4814h-20.3702c-1.259,0-1.9999,1.4074-1.3333,2.4444l40.1475,59.5547c2.8887,4.2963,2.8887,9.9258,0,14.222l-40.1475,59.5547c-.7408,1.037.0742,2.4444,1.3333,2.4444h20.3702c5.6296,0,10.8886-2.8148,14.0739-7.4814l22.5181-33.3328c2.9629-4.3703,9.3332-4.3703,12.2961,0l22.5183,33.3329c3.1109,4.6666,8.4441,7.4813,14.0737,7.4813h20.3702c1.2592,0,1.9999-1.4074,1.3333-2.4444l-40.2216-59.4806c-2.8889-4.2963-2.8889-9.9258,0-14.222l40.1475-59.5547c.7406-1.037,0-2.5185-1.2592-2.5185ZM320.514,2.2962h-11.9999c-6.0738,0-11.185,4.2963-12.4443,9.9999-10.6664-8.1481-24.0737-12.2961-38.5179-12.2961-35.1106,0-63.6287,24.4441-63.6287,70.5916s28.4439,70.5916,63.6287,70.5916c14.37,0,27.6293-4.0741,38.2957-12.0739.5926,6.4443,6,11.5554,12.6665,11.5554h11.9999c1.1852,0,2.1481-.9629,2.1481-2.1481V4.4444c-.0742-1.1852-.963-2.1481-2.1481-2.1481ZM257.5519,114.9613c-20.9628,0-37.9997-15.3331-37.9997-44.2957s17.0369-44.2957,37.9997-44.2957,37.9995,15.3331,37.9995,44.2957-17.0369,44.2957-37.9995,44.2957Z"/></svg>`,
                    table_key: 'shows',
                    heading: 'Streaming',
                    name: 'HBO',
                    token: 'hbo',
                },
                {
                    image: `<svg class="amazon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 415.1079 97.9"><defs><style>.fox-cls-1{fill:#06a7e0;}.fox-cls-2{fill:#d1edf8;}</style></defs><path class="fox-cls-2" d="M202.0078,97.9v-.4c.4-.5,1.1-.8,1.7-.7,2.9-.1,5.7-.1,8.6,0,.6,0,1.3.2,1.7.7v.4h-12Z"/><path class="fox-cls-1" d="M214.0078,97.5c-4-.1-8-.1-12,0-5.5-.3-11-.5-16.5-.9-14.6-1.1-29.1-3.3-43.3-6.6C93.1078,78.6,50.0079,55.7,12.4078,22.4c-3.5-3.1-6.8-6.3-10.2-9.5-.8-.7-1.5-1.7-1.9-2.7C-.2922,8.8.0079,7.3,1.0079,6.2s2.6-1.5,4-.9c.9.4,1.8.8,2.6,1.3,35.9,22.2,75.1,38.4,116.2,48,13.8,3.2,27.7,5.7,41.7,7.5,20.1,2.5,40.4,3.4,60.6,2.7,10.9-.3,21.7-1.3,32.5-2.7,25.2-3.2,50.1-8.9,74.2-16.9,12.7-4.2,25.1-9,37.2-14.6,1.8-1,4-1.3,6-.8,3.3.8,5.3,4.2,4.5,7.5-.1.4-.3.9-.5,1.3-.8,1.5-1.9,2.8-3.3,3.8-11.5,9-23.9,16.9-37,23.5-24.7,12.5-51.1,21.4-78.3,26.5-15.7001,2.8-31.5001,4.5-47.4001,5.1Z"/><path class="fox-cls-1" d="M385.9079,0c6.6.2,13.1.6,19.5,2.3,1.8.5,3.5,1.1,5.2,1.9,2.3.9,3.8,3.1,4.1,5.5.4,2.8.5,5.7.3,8.6-1.3,17.1-6.6,33.6-15.4,48.3-3.2,5.3-7.1,10.1-11.6,14.3-.9.9-2,1.6-3.2,2-1.9.5-3.1-.5-3.2-2.4.1-1,.3-2,.7-3,3.5-9.4,6.9-18.7,9.6-28.4,1.6-5.3,2.7-10.7,3.4-16.2.2-2,.3-4,.1-6-.1-3.4-2.3-6.3-5.6-7.3-3.1-1-6.3-1.6-9.6-1.8-9.2-.4-18.4,0-27.5,1.2l-12.1,1.5c-1.3.1-2.5,0-3.2-1.2s-.4-2.4.3-3.6c.8-1.1,1.8-2.1,3-2.8,7.4-5.3,15.7-8.5,24.5-10.6,6.8-1.4,13.7-2.1,20.7-2.3Z"/></svg>`,
                    table_key: 'shows',
                    heading: 'Streaming',
                    name: 'Amazon Prime',
                    token: 'amazon',
                },
                {
                    image: `<svg class="apple" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50.8577 56.8083"><path d="M31.3655,9.1141c2.1151-2.5465,3.1633-5.8124,2.925-9.1141-3.2417.3129-6.2341,1.8759-8.343,4.3576-2.121,2.4009-3.1976,5.5482-2.9915,8.7451,3.2738.0642,6.3878-1.4128,8.4094-3.9887"/><path d="M34.0911,13.7044c-4.6534-.2692-8.5756,2.6591-10.8026,2.6591s-5.6174-2.5129-9.2736-2.4464c-4.872.1373-9.3033,2.8556-11.6336,7.1364-4.9858,8.6421-1.3296,21.5155,3.5233,28.5522,2.36,3.3438,5.1853,7.3292,8.9413,7.1995s4.9194-2.3267,9.2072-2.3267,5.5509,2.3267,9.2736,2.2436,6.3154-3.3505,8.6421-6.9802c1.6783-2.4792,2.9883-5.1887,3.8889-8.0438-4.5657-2.0213-7.5197-6.5342-7.5452-11.5272.056-4.407,2.3472-8.4836,6.0827-10.8226-2.3675-3.3851-6.1769-5.4741-10.3041-5.6506"/></svg>`,
                    table_key: 'shows',
                    heading: 'Streaming',
                    name: 'Apple TV+',
                    token: 'apple',
                },
                {
                    image: `<svg class="abc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 200.25"><defs><style>.abc-fox-cls-1{fill:#fff;}</style></defs><path d="M100.02,0C44.555,0,0,44.6855,0,100.125s44.557,100.125,100.02,100.125,99.98-44.6855,99.98-100.125S155.48,0,100.02,0Z"/><path class="abc-fox-cls-1" d="M34.4385,68.735c-17.3975,0-31.3565,14.016-31.3565,31.392s13.959,31.392,31.3565,31.392c10.683,0,14.859-7.542,14.859-7.542v6.861h16.4975v-30.7115c0-17.3765-13.959-31.392-31.3565-31.392v.0005ZM34.4385,85.148c8.2945,0,14.9435,6.688,14.9435,14.9795s-6.649,14.9795-14.9435,14.9795-14.9435-6.688-14.9435-14.9795,6.649-14.9795,14.9435-14.9795Z"/><path class="abc-fox-cls-1" d="M69.785,47.1165v53.01c0,17.3765,13.9695,31.403,31.367,31.403s31.331-14.027,31.331-31.403-13.9335-31.403-31.331-31.403c-10.683,0-14.8735,7.5625-14.8735,7.5625v-29.1705l-16.4935.001ZM101.152,85.146c8.2945,0,14.9455,6.69,14.9455,14.9815s-6.6505,14.9815-14.9455,14.9815-14.9455-6.69-14.9455-14.9815,6.651-14.9815,14.9455-14.9815Z"/><path class="abc-fox-cls-1" d="M166.53,68.735c-17.3975,0-31.3565,14.016-31.3565,31.392s13.959,31.392,31.3565,31.392c15.017,0,27.4765-10.4435,30.604-24.476h-17.3445c-2.4879,4.7853-7.4705,8.063-13.2595,8.063-8.2945,0-14.9435-6.688-14.9435-14.9795s6.649-14.9795,14.9435-14.9795c5.8065,0,10.815,3.2901,13.295,8.099h17.3085c-3.1147-14.05-15.5745-24.5115-30.604-24.5115l.0005.0005Z"/></svg>`,
                    table_key: 'shows',
                    heading: 'Networks',
                    name: 'ABC',
                    token: 'abc',
                },
                {
                    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 370.2188 207.8676"><defs><style>.nbc-fox-cls-1{fill:#fccc15;}.nbc-fox-cls-2{fill:#f37222;}.nbc-fox-cls-3{fill:#ea1f44;}.nbc-fox-cls-4{fill:#209cd8;}.nbc-fox-cls-5{fill:#17ac4c;}.nbc-fox-cls-6{fill:#685ea9;}</style></defs><path class="nbc-fox-cls-3" d="M140.6659,0c1.5345.7298,3.2469.6221,4.8544,1.0367,14.6959,3.7905,24.0466,12.7983,27.2152,27.8168,1.1521,5.4608.5193,10.9086-.2859,16.3602-1.8663,12.6355-3.6556,25.2823-5.4727,37.9251-1.8089,12.5853-3.6122,25.1714-5.4208,37.7567-1.8168,12.6428-3.6368,25.2851-5.4562,37.9275-.4734,3.2895-.9501,6.5785-1.4355,9.9385-.692-.466-.7754-1.1948-1.0389-1.7974-16.6659-38.1173-33.3522-76.2257-49.9597-114.3684-6.1482-14.1207-4.7642-27.5235,4.9689-39.5779,5.8092-7.1946,13.5593-11.4856,22.8658-12.6796.2846-.0365.5895-.0227.7464-.3382h8.4189Z"/><path class="nbc-fox-cls-1" d="M0,166.1345c.6436-.8888.5206-1.974.75-2.9671,3.5062-15.1786,18.6448-30.2794,37.7417-29.2277,6.9747.3841,13.3965,2.5506,19.1955,6.4268,33.1538,22.1607,66.29,44.3476,99.4311,66.5272.2883.193.5621.4078.8625.6269-.3599.547-.8705.2834-1.2746.2836-39.6279.0151-79.2567.1709-118.8832-.0721-13.6934-.0839-25.0841-5.4715-32.6708-17.4275-2.7685-4.363-4.0928-9.2475-4.784-14.3247-.0515-.3781.1088-.8437-.3683-1.0831v-8.7624Z"/><path class="nbc-fox-cls-6" d="M226.2581,0c2.2582.7252,4.6437.9033,6.8966,1.6876,14.4458,5.0291,22.9448,15.0167,25.3993,30.1425,1.13,6.9637-.0026,13.5362-2.8041,19.9659-16.7889,38.532-33.5193,77.0894-50.2725,115.6369-.1802.4146-.4019.8112-.8103,1.6286-.6768-4.8124-1.2925-9.2032-1.9119-13.5934-1.8168-12.8758-3.6383-25.751-5.452-38.6272-1.5778-11.2019-3.1503-22.4045-4.7195-33.6077-.728-5.1973-1.2877-10.424-2.2096-15.5864-.7994-4.4765.549-8.1704,3.3456-11.491,4.4086-5.2347,10.2349-8.4036,16.4008-11.0443,2.3754-1.0173,2.5233-1.7342.5144-3.5407-2.4859-2.2356-5.5628-2.8885-8.7722-2.9383-4.6742-.0726-9.351-.0663-14.025.0099-1.3309.0217-1.8468-.3188-1.8615-1.7157-.188-17.8889,10.1144-30.9641,26.6873-35.5588,1.9457-.5394,4.0005-.566,5.8773-1.3677h7.7173Z"/><path class="nbc-fox-cls-4" d="M209.3617,188.2538c1.4157-3.2372,2.826-6.4768,4.2478-9.7114,15.1852-34.5458,30.2946-69.1253,45.5975-103.619,6.0274-13.586,16.6832-21.1957,31.5664-22.3741,12.375-.9798,23.0165,2.9547,30.8357,12.8149,9.3079,11.7374,12.095,31.2713,1.1164,45.0682-3.0196,3.7948-6.6855,6.8229-10.6883,9.5014-31.8859,21.337-63.766,42.6827-95.6472,64.0267-2.2516,1.5074-4.4974,3.0233-6.7459,4.5353l-.2824-.2421Z"/><path class="nbc-fox-cls-2" d="M149.3903,188.2634c-3.3169-2.1634-6.6562-4.2933-9.9471-6.4954-30.8504-20.644-61.6788-41.3208-92.5464-61.939-7.9331-5.299-14.0102-11.9772-16.4923-21.3961-3.5353-13.4153,1.3713-32.6561,16.3997-41.2049,18.2694-10.3924,43.5852-4.1527,53.1468,17.6676,15.2939,34.9017,30.6544,69.7744,45.981,104.6618,1.2413,2.8255,2.4384,5.6704,3.656,8.5062-.0673.0652-.1332.1319-.1978.1998Z"/><path class="nbc-fox-cls-5" d="M200.921,207.497c5.7644-3.8548,11.5276-7.7114,17.2934-11.564,27.3221-18.2565,54.6625-36.4858,81.9545-54.7869,6.4114-4.2993,13.3379-6.9864,21.0685-7.1968,13.643-.3713,24.0456,5.6427,31.6986,16.6632,10.2174,14.7132,6.6004,33.24-1.104,42.9605-6.5768,8.2977-15.4086,12.3896-25.6475,13.9117-2.2021.3273-4.423.338-6.6462.3376-38.8679-.0076-77.7358-.0055-116.6037-.0055h-1.9039l-.1098-.3196Z"/><path class="nbc-fox-cls-2" d="M149.588,188.0635c.0331.1292.1289.3428.0884.3728-.1714.1272-.2397-.0274-.2862-.173.0645-.0679.1305-.1346.1977-.1998Z"/></svg>`,
                    heading: 'Networks',
                    table_key: 'shows',
                    name: 'NBC',
                    token: 'nbc',
                },
                {
                    image: `<svg class="cbs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190.9233 179.9373"><g id="layer1"><path id="path996" d="M0,89.9477C0,40.2674,40.2673,0,89.9476,0s89.9756,40.2674,89.9756,89.9477-40.2813,89.9895-89.9756,89.9895S0,139.6419,0,89.9477M174.4685,89.9477c-13.6369-29.7355-45.2885-53.6385-84.5208-53.6385S19.0777,60.2123,5.4408,89.9477c13.6369,29.7495,45.2745,53.6385,84.5068,53.6385s70.8839-23.889,84.5208-53.6385"/><path id="path1000" d="M41.8353,89.496c0-26.3507,21.3295-47.6942,47.6523-47.6942,26.3367,0,47.6803,21.3435,47.6803,47.6942,0,26.3227-21.3435,47.6662-47.6803,47.6662-26.3227,0-47.6523-21.3435-47.6523-47.6662"/></g></svg>`,
                    heading: 'Networks',
                    table_key: 'shows',
                    name: 'CBS',
                    token: 'cbs',
                },
                {
                    image: `<svg class="fox" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.1459 226.1115"><defs><style>.fox-cls-1{fill:#224190;}</style></defs><g id="g3"><g id="g5"><path id="path7" class="fox-cls-1" d="M63.7924,61.7879v29.3905h62.1213v61.4553h-62.1213v72.8071H0S0,0,0,0h135.5991l4.3425,61.7879H63.7924Z"/><path id="path9" class="fox-cls-1" d="M322.0613,34.6538c21.1632,21.6022,31.7508,47.6794,31.7508,78.226,0,30.768-10.5885,56.9517-31.7508,78.5567-21.1669,21.6013-46.6957,32.4019-76.5883,32.4019-30.1121,0-55.7549-10.8007-76.9171-32.4019-21.1678-21.6041-31.7489-47.7887-31.7489-78.5567,0-30.5475,10.5811-56.6237,31.7489-78.226C189.7181,13.0516,215.3608,2.25,245.473,2.25c29.8917,0,55.4214,10.8016,76.5883,32.4038h0ZM227.1434,158.048c0,5.0233,1.8517,9.3853,5.5643,13.0932,3.707,3.7126,8.1829,5.5652,13.4193,5.5652s9.6558-1.8526,13.2563-5.5652c3.6015-3.708,5.4012-8.0699,5.4012-13.0932v-91.3183c0-5.2364-1.7998-9.7067-5.4012-13.4193-3.5996-3.707-8.0181-5.5643-13.2563-5.5643s-9.7113,1.8572-13.4193,5.5643c-3.7135,3.7126-5.5643,8.1829-5.5643,13.4193v91.3183h0Z"/><path id="path11" class="fox-cls-1" d="M453.3374,226.1115l-32.0611-57.1138-31.0607,57.1138h-70.1375l66.7982-116.8971L323.7518,0h72.1421l26.3856,48.7622L448.9976,0h69.8022l-61.7879,108.5456,68.134,117.565h-71.8086v.0009Z"/></g></g></svg>`,
                    heading: 'Networks',
                    table_key: 'shows',
                    name: 'FOX',
                    token: 'fox',
                },
                {
                    image: `<svg class="cw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640.8184 278.467"><defs><style>.cw-cls-1{fill:#f04923;fill-rule:evenodd;}</style></defs><path id="rect5" class="cw-cls-1" d="M132.4505,0C59.025.3297,0,62.2039,0,139.0478c0,77.0494,59.3337,139.0784,133.0325,139.0784h89.4401c31.4071,0,60.1801-11.2918,82.8888-30.1835,18.4496,18.878,43.9775,30.5243,72.2635,30.5243,29.1725,0,55.3899-12.4107,73.9559-32.343,19.3378,19.933,46.6449,32.343,77.0305,32.343,58.2487,0,105.1874-45.5473,106.207-102.4738V0h-86.5148c.0009,198.952.1763-69.5327.1763,162.68,0,14.634-11.7819,26.4158-26.4158,26.4158s-26.4158-11.7818-26.4158-26.4158c0-232.2127.1753,36.2717.1761-162.68h-87.6674c.0009,198.9516.1762-69.5327.176,162.68,0,14.634-11.7818,26.4158-26.4158,26.4158s-26.4158-11.7818-26.4158-26.4158c0-232.2127.1753,36.2717.176-162.68h-87.491v139.0478c0,28.6316-20.7988,51.683-46.6326,51.683h-87.6635c-25.8338,0-46.6326-23.0514-46.6326-51.683s20.7988-51.683,46.6326-51.683h85.2168V0h-86.6564Z"/></svg>`,
                    heading: 'Networks',
                    table_key: 'shows',
                    name: 'The CW',
                    token: 'cw',
                },
            ];

            // Process genres
            let genreCategories = [];
            let genreItems = [];

            for (let k in allGenres) {
                let genre = allGenres[k];

                if (!genre.deleted) {
                    genreCategories.push({
                        table_key: 'shows',
                        heading: 'Genres',
                        name: genre.name,
                        token: `genre_${k}`,
                    });

                    genreItems.push({
                        token: k,
                        name: genre.name,
                        category: 'genres',
                    });
                }
            }

            genreCategories.sort((a, b) => a.name.localeCompare(b.name));

            // Build decade categories
            let decadeCategories = [];
            let currentYear = new Date().getFullYear();
            let currentDecade = Math.floor(currentYear / 10) * 10;

            for (let decade = currentDecade; decade >= 1950; decade -= 10) {
                decadeCategories.push({
                    table_key: 'shows',
                    heading: 'Decades',
                    name: `${decade}s`,
                    token: `${decade}s`,
                });
            }

            // Combine all categories in order
            const categories = [
                ...mainCategories,
                ...networkCategories,
                ...genreCategories,
                ...decadeCategories,
            ];

            genreItems.sort((a, b) => a.name.localeCompare(b.name));

            resolve({
                options: categories,
                items: genreItems,
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getTvShows() {
    return new Promise(async (resolve, reject) => {
        try {
            if (module.exports.cache.tv_shows) {
                return resolve(module.exports.cache.tv_shows);
            }

            const section = sectionsData.tv_shows;
            const categoryData = await getTvCategories();

            const data = {
                myStr: section.myStr,
                tabs: section.tabs,
                options: categoryData.items,
                autoComplete: section.autoComplete,
                categories: {
                    endpoint: section.categories.endpoint,
                    options: categoryData.options,
                },
                styles: section.styles,
                tables: Object.keys(section.tables).map((key) => ({
                    name: key,
                    isFavorable: section.tables[key].isFavorable,
                })),
            };

            module.exports.cache.tv_shows = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getWork() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.cache.work) {
            return resolve(module.exports.cache.work);
        }

        try {
            let section = sectionsData.work;

            // Get all industries and roles from Redis
            const [industries, roles] = await Promise.all([
                cacheService.hGetAllObj(cacheService.keys.work_industries),
                cacheService.hGetAllObj(cacheService.keys.work_roles),
            ]);

            // Organize roles by category
            const roleCategories = {};
            const roleItems = [];
            for (const [token, roleData] of Object.entries(roles)) {
                // Skip if not visible
                if (!roleData.is_visible || roleData.deleted) continue;

                // Add to items
                roleItems.push({
                    token: token,
                    name: roleData.name,
                    category: 'roles',
                    category_token: roleData.category_token,
                    table_key: 'roles',
                });

                // Group by category
                if (!roleCategories[roleData.category_token]) {
                    roleCategories[roleData.category_token] = {
                        table_key: 'roles',
                        heading: 'Roles',
                        name: roleData.category_name,
                        token: roleData.category_token,
                    };
                }
            }

            // Build industry items
            const industryItems = [];

            for (const [token, industryData] of Object.entries(industries)) {
                // Skip if not visible
                if (!industryData.is_visible || industryData.deleted) continue;

                industryItems.push({
                    token: token,
                    name: industryData.name,
                    category: 'industries',
                    table_key: 'industries',
                });
            }

            // Build category options
            const sortedRoleCategories = Object.entries(roleCategories)
                .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                .reduce((obj, [key, value]) => {
                    obj[key] = value;
                    return obj;
                }, {});

            const categoryOptions = [
                {
                    table_key: 'industries',
                    name: 'Industries',
                },
                ...Object.values(sortedRoleCategories),
            ];

            // Combine all items
            const itemOptions = [...industryItems, ...roleItems];

            itemOptions.sort((a, b) => {
                if (a.category === b.category) {
                    return a.name.localeCompare(b.name);
                }
                return 0;
            });

            let data = {
                myStr: section.myStr,
                tabs: section.tabs,
                autoComplete: section.autoComplete,
                options: itemOptions,
                styles: section.styles,
                categories: {
                    options: categoryOptions,
                },
                tables: Object.keys(section.tables).reduce((acc, key) => {
                    acc.push({
                        name: key,
                        type: section.tables[key].type,
                    });
                    return acc;
                }, []),
            };

            module.exports.cache.work = data;

            resolve(data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    cache: {},
    sections: sectionsData,
    putModes,
    putPartner,
    addKid,
    updateKid,
    removeKid,
    addSection,
    deleteSection,
    addSectionItem,
    updateSectionItem,
    updateSectionPositions,
    getPersonSectionItems,
    getAllSections,
    getSections,
    getActiveData,
    dataForSchema,
    selectSectionOptionItem,
    getInstruments,
    allInstruments,
    getMusic,
    getSchools,
    getMusicCategories,
    getLifeStages,
    getMovies,
    getMovieCategories,
    getDrinking,
    getGenders,
    getLanguages,
    getPolitics,
    getRelationshipStatus,
    getReligions,
    getSmoking,
    getSports,
    getSportCategories,
    getTvCategories,
    getTvShows,
    getWork,
};
