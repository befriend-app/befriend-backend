const cacheService = require("../services/cache");
const dbService = require("../services/db");
const { getPersonCacheKey } = require("./shared");

module.exports = {
    getPersonByEmail: function (person_email) {
        return new Promise(async (resolve, reject) => {
            try {
                let person;

                //use cached data
                let cache_key = getPersonCacheKey(person_email);

                person = await cacheService.get(cache_key, true);

                if (person) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                person = await conn("persons").where("email", person_email).first();

                if (person) {
                    await cacheService.setCache(cache_key, person);
                }

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
    getPersonByToken: function (person_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let person;

                //use cached data
                let cache_key = getPersonCacheKey(person_token);

                person = await cacheService.get(cache_key, true);

                if (person) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                person = await conn("persons").where("person_token", person_token).first();

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
