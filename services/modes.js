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

function getPersonExcludedModes(person, person_filters) {
    return new Promise(async (resolve, reject) => {
        try {
            let personModes = person.modes;
            let personSelectedModes = personModes?.selected || [];
            let modesFilter = person_filters.modes;

            let hasValidPartner = false;
            let hasValidKid = false;

            let soloModeItem = Object.values(modesFilter.items || {})
                .find(item => item.mode_token === 'mode-solo');

            let partnerModeItem = Object.values(modesFilter.items || {})
                .find(item => item.mode_token === 'mode-partner');

            let kidsModeItem = Object.values(modesFilter.items || {})
                .find(item => item.mode_token === 'mode-kids');

            let exclude_send = new Set();
            let exclude_receive = new Set();

            if(!personSelectedModes.includes('mode-solo')) {
                exclude_send.add('mode-solo');
                exclude_receive.add('mode-solo');
            } else {
                if(!soloModeItem?.is_active || soloModeItem?.is_negative) {
                    if(modesFilter.is_active) {
                        if(modesFilter.is_send) {
                            exclude_send.add('mode-solo');
                        }

                        if(modesFilter.is_receive) {
                            exclude_receive.add('mode-solo');
                        }
                    }
                }
            }

            if(!personSelectedModes.includes('mode-partner')) {
                exclude_send.add('mode-partner');
                exclude_receive.add('mode-partner');
            } else {
                hasValidPartner = personModes?.partner &&
                    !personModes.partner.deleted &&
                    personModes.partner.gender_id;

                if (!hasValidPartner) {
                    exclude_send.add('mode-partner');
                    exclude_receive.add('mode-partner');
                }

                if(!partnerModeItem || !partnerModeItem.is_active || partnerModeItem.is_negative) {
                    if(modesFilter.is_active) {
                        if(modesFilter.is_send) {
                            exclude_send.add('mode-partner');
                        }

                        if(modesFilter.is_receive) {
                            exclude_receive.add('mode-partner');
                        }
                    }
                }
            }

            if(!personSelectedModes.includes('mode-kids')) {
                exclude_send.add('mode-kids');
                exclude_receive.add('mode-kids');
            } else {
                hasValidKid = Object.values(personModes.kids || {}).some(kid =>
                    !kid.deleted &&
                    kid.gender_id &&
                    kid.age_id &&
                    kid.is_active
                );

                if (!hasValidKid) {
                    exclude_send.add('mode-kids');
                    exclude_receive.add('mode-kids');
                }

                if(!kidsModeItem || !kidsModeItem.is_active || kidsModeItem.is_negative) {
                    if(modesFilter.is_active) {
                        if(modesFilter.is_send) {
                            exclude_send.add('mode-kids');
                        }

                        if(modesFilter.is_receive) {
                            exclude_receive.add('mode-kids');
                        }
                    }
                }
            }

            resolve({
                send: exclude_send,
                receive: exclude_receive,
            });
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    modes: {
        data: appModes,
        lookup: null,
    },
    kidAgeOptions: null,
    getModes,
    getKidAgeOptions,
    getPersonExcludedModes
};
