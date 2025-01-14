const dbService = require('../services/db');
const cacheService = require('../services/cache');

module.exports = {
    data: null,
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
                if (module.exports.data) {
                    return resolve(module.exports.data);
                }

                //from cache first
                let genders = await cacheService.getObj(module.exports.cache_key);

                if (genders) {
                    module.exports.data = genders;

                    return resolve(genders);
                }

                let conn = await dbService.conn();

                //db backup
                genders = await conn('genders').orderBy('sort_position');

                //save to cache
                await cacheService.setCache(module.exports.cache_key, genders);

                module.exports.data = genders;

                resolve(genders);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    getGendersLookup: function () {
        return new Promise(async (resolve, reject) => {
            try {
                let genders = await module.exports.getAllGenders();

                genders = genders.reduce(
                    (acc, gender) => {
                        acc.byId[gender.id] = gender;
                        acc.byToken[gender.gender_token] = gender;
                        return acc;
                    },
                    { byId: {}, byToken: {} },
                );

                resolve(genders);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
};
