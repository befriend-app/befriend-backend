const cacheService = require('../services/cache');
const dbService = require('../services/db');

module.exports = {
    getMeSections: function(person) {
        return new Promise(async (resolve, reject) => {
            if(!person || !person.person_token) {
                return resolve("person required");
            }

            //options, active, data
            let all_me_sections;

            //lookup dict
            let me_dict = {};

            //return object
            let organized = {
                options: {},
                active: {}
            };

            try {
                let conn = await dbService.conn();

                let me_sections_cache_key = cacheService.keys.me_sections;
                let person_sections_cache_key = cacheService.keys.person_sections(person.person_token);

                //all me sections
                all_me_sections = await cacheService.getObj(me_sections_cache_key);

                if(!all_me_sections) {
                    all_me_sections = await conn('me_sections').where('active', 1).orderBy('position', 'asc');

                    if (all_me_sections) {
                        await cacheService.setCache(me_sections_cache_key, all_me_sections);
                    }
                }

                //person sections
                let person_sections = await cacheService.getObj(person_sections_cache_key);

                if(!person_sections) {
                    person_sections = await conn('persons_sections')
                        .where('person_id', person.id)
                        .orderBy('position', 'asc');
                }

                for(let section of all_me_sections) {
                    me_dict[section.id] = section;
                }

                //add to active first
                for(let section of person_sections) {
                    let section_data = me_dict[section.section_id];

                    organized.active[section_data.section_key] = section;
                }

                //options
                for(let section of all_me_sections) {
                    if(!(section.section_key in organized.active)) {
                        organized.options[section.section_key] = section;
                    }
                }

                return resolve(organized);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
}