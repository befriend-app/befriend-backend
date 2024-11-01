const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');
const { setCache } = require('./cache');

module.exports = {
    addMeSection: function (person, section_key) {
        return new Promise(async (resolve, reject) => {
            if(!person || !person.person_token || !section_key) {
                return reject("Person and section key required");
            }

            let sections_dict = {
                byId: {},
                byKey: {}
            };

            try {
                let conn = await dbService.conn();
                let cache_key = cacheService.keys.person_sections(person.person_token);

                let all_sections = await module.exports.getAllMeSections();

                for(let section of all_sections) {
                    sections_dict.byId[section.id] = section;
                    sections_dict.byKey[section.section_key] = section;
                }

                let person_sections = await cacheService.getObj(cache_key);

                if(!person_sections) {
                    person_sections = {};

                    let sections_qry = await conn('persons_sections')
                        .where('person_id', person.id)
                        .orderBy('position', 'asc');

                    for(let section of sections_qry) {
                        let section_data = sections_dict.byId[section.section_id];

                        person_sections[section_data.section_key] = section;
                    }
                }

                //check if valid
                if(!(section_key in sections_dict.byKey)) {
                    return reject("Invalid section key");
                }

                let section_data = sections_dict.byKey[section_key];

                //check if exists
                if(!(section_key in person_sections)) {
                    //add to db
                    let data = {
                        person_id: person.id,
                        section_id: section_data.id,
                        position: Object.keys(person_sections).length,
                        created: timeNow(),
                        updated: timeNow()
                    };

                    let [id] = await conn('persons_sections')
                        .insert(data);

                    data.id = id;

                    //add to cache
                    person_sections[section_key] = data;

                    await setCache(cache_key, person_sections);

                    resolve();
                } else {
                    return reject("Section added previously");
                }
            } catch(e) {
                console.error(e);
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
                byKey: {}
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

                    for(let section of sections_qry) {
                        let section_data = me_dict.byId[section.section_id];

                        person_sections[section_data.section_key] = section;
                    }
                }

                //add to active first
                for (let section_key in person_sections) {
                    organized.active[section_key] = person_sections[section_key];
                }

                //options
                for (let section of all_me_sections) {
                    if (!(section.section_key in organized.active)) {
                        organized.options[section.section_key] = section;
                    }
                }

                return resolve(organized);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
};
