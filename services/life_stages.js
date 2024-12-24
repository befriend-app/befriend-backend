const cacheService = require('./cache');
const dbService = require('./db');

module.exports = {
    importance: {
        default: 7
    },
    data: null,
    getLifeStages: function () {
        return new Promise(async (resolve, reject) => {
            try {
                if (module.exports.data) {
                    return resolve(module.exports.data);
                }

                const cache_key = cacheService.keys.life_stages;
                let options = await cacheService.getObj(cache_key);

                if (!options) {
                    let conn = await dbService.conn();

                    options = await conn('life_stages')
                        .where('is_visible', true)
                        .orderBy('sort_position')
                        .select('id', 'token', 'name');

                    await cacheService.setCache(cache_key, options);
                }

                module.exports.data = options;

                return resolve(options);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
};
