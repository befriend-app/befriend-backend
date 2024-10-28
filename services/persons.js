const cacheService = require('../services/cache');
const dbService = require('../services/db');

module.exports = {
    isAuthenticated: function (person_token, login_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if(!person_token) {
                    return resolve(false);
                }

                let cache_key = cacheService.keys.person_login_tokens(person_token);

                let is_valid_token = await cacheService.isSetMember(cache_key, login_token);

                return resolve(is_valid_token);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getPerson: function (person_token, email) {
        return new Promise(async (resolve, reject) => {
            if (!email && !person_token) {
                return reject('Email or person token required');
            }

            try {
                let person;

                //use cached data
                let cache_key = cacheService.keys.person(person_token || email);

                person = await cacheService.getObj(cache_key);

                if (person) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                if (email) {
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
