const dbService = require('./db');
const cacheService = require('./cache');

const appModes = [
    {
        token: 'mode-solo',
        name: 'Solo',
    },
    {
        token: 'mode-partner',
        name: 'Partner',
    },
    {
        token: 'mode-kids',
        name: 'Kids',
    },
];

function getModes() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.modes.lookup) {
            return resolve(module.exports.modes.lookup);
        }

        try {
            let conn = await dbService.conn();

            let data = await conn('modes').whereNull('deleted');

            let organized = data.reduce(
                (acc, item) => {
                    acc.byId[item.id] = item;
                    acc.byToken[item.token] = item;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            module.exports.modes.lookup = organized;

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getKidAgeOptions() {
    return new Promise(async (resolve, reject) => {
        if(module.exports.kidAgeOptions) {
            return resolve(module.exports.kidAgeOptions);
        }

        let cache_key_kid_ages = cacheService.keys.kids_ages;

        let cached_ages = await cacheService.getObj(cache_key_kid_ages);

        if (cached_ages) {
            return resolve(cached_ages);
        }

        let conn = await dbService.conn();

        let ages = await conn('kids_ages')
            .whereNull('deleted')
            .orderBy('age_min')
            .select('id', 'token', 'name', 'age_min', 'age_max');


        // Organize data
        let ages_dict = {};
        for (let age of ages) {
            ages_dict[age.token] = {
                id: age.id,
                token: age.token,
                name: age.name,
                range: {
                    min: age.age_min,
                    max: age.age_max,
                },
            };
        }

        // Update cache
        await cacheService.setCache(cache_key_kid_ages, ages_dict);

        module.exports.kidAgeOptions = ages_dict;

        resolve(ages_dict);
    });
}

module.exports = {
    modes: {
        data: appModes,
        lookup: null,
    },
    kidAgeOptions: null,
    getModes,
    getKidAgeOptions
};
