const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');

module.exports = {
    isAuthenticated: function (person_token, login_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!person_token) {
                    return resolve(false);
                }

                let cache_key = cacheService.keys.person_login_tokens(person_token);

                let is_valid_token = await cacheService.isSetMember(cache_key, login_token);

                return resolve(is_valid_token);
            } catch (e) {
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

                //todo remove to use cache
                if (person && false) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                //todo filter cols
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
    updatePerson: function (person_token, data) {
        return new Promise(async (resolve, reject) => {
            if (!person_token) {
                return reject('Person token required');
            }

            try {
                let person = await module.exports.getPerson(person_token);

                if(!person) {
                    return reject("No person found");
                }

                //use cached data
                let cache_key = cacheService.keys.person(person_token);

                let conn = await dbService.conn();

                data.updated = timeNow();

                await conn('persons')
                    .where('id', person.id)
                    .update(data);

                Object.assign(person, data);

                await cacheService.setCache(cache_key, person);

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
};
