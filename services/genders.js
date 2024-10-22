const dbService = require('../services/db');
const cacheService = require('../services/cache');

module.exports = {
    cache_key: 'genders',
    getGender: function (gender_id) {
        return new Promise(async (resolve, reject) => {
            try {
                let genders = await module.exports.getAllGenders();

                for (let gender of genders) {
                    if (gender_id === gender.id) {
                        return resolve(gender);
                    }
                }

                return resolve(null);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getGenderByToken: function (gender_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let genders = await module.exports.getAllGenders();

                for (let gender of genders) {
                    if (gender_token === gender.gender_token) {
                        return resolve(gender);
                    }
                }

                return resolve(null);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getAllGenders: function () {
        return new Promise(async (resolve, reject) => {
            try {
                //from cache first
                let genders = await cacheService.getObj(module.exports.cache_key);

                if (genders) {
                    return resolve(genders);
                }

                let conn = await dbService.conn();

                //db backup
                genders = await conn('genders').orderBy('sort_position');

                //save to cache
                await cacheService.setCache(module.exports.cache_key, genders);

                resolve(genders);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
};
