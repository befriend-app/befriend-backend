const cacheService = require('../services/cache');
const dbService = require('../services/db');

module.exports = {
    getPerson: function (email, person_token) {
        return new Promise(async (resolve, reject) => {
            if(!email && !person_token) {
                return reject("Email or person token required");
            }

            try {
                let person;

                //use cached data
                let cache_key = cacheService.keys.person(email || person_token);

                person = await cacheService.get(cache_key, true);

                if (person) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                if(email) {
                    person = await conn('persons').where('email', email).first();
                } else {
                    person = await conn('persons').where('person_token', person_token).first();
                }

                if (person) {
                    await cacheService.setCache(cache_key, person);
                }

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
};
