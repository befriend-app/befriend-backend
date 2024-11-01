const cacheService = require('../services/cache');
const dbService = require('../services/db');

module.exports = {
    getMeSections: function(person_token) {
        return new Promise(async (resolve, reject) => {
            if(!person_token) {
                return resolve("person token required");
            }

            try {
                let me_sections;

                // use cached_data
                let cache_key = cacheService.keys.person_sections(person_token);
                me_sections = await cacheService.getObj(cache_key);

                //TODO remove to use cache
                if (me_sections && false) {
                    return resolve(me_sections);
                }

                let conn = await dbService.conn();

                me_sections = await conn('me_sections').where('active', 1).orderBy('position', 'asc');

                if (me_sections) {
                    await cacheService.setCache(cache_key, me_sections);
                }

                return resolve(me_sections);

            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
}