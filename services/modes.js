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

function getModeById(id) {
    return new Promise(async (resolve, reject) => {
        try {
            let modes = await getModes();

            resolve(modes.byId[id]);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getModeByToken(token) {
    return new Promise(async (resolve, reject) => {
        try {
            let modes = await getModes();

            resolve(modes.byToken[token]);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

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

function getKidsAgeOptions() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.kidsAgeOptions) {
            return resolve(module.exports.kidsAgeOptions);
        }

        try {
            let cache_key_kid_ages = cacheService.keys.kids_ages;

            let cached_ages = await cacheService.getObj(cache_key_kid_ages);

            if (cached_ages) {
                return resolve(cached_ages);
            }

            let ages_dict = await setKidAgesCache();

            resolve(ages_dict);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getKidsAgeLookup() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.kidsAgeLookup) {
            return resolve(module.exports.kidsAgeLookup);
        }

        try {
            let options = await getKidsAgeOptions();

            let lookup = {
                byId: {},
                byToken: {}
            }

            for(let k in options) {
                let v = options[k];

                lookup.byId[v.id] = v;
                lookup.byToken[v.token] = v;
            }

            module.exports.kidsAgeLookup = lookup;

            resolve(lookup);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function setKidAgesCache() {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key_kid_ages = cacheService.keys.kids_ages;

            let ages_dict = {};

            let conn = await dbService.conn();

            let ages = await conn('kids_ages')
                .whereNull('deleted')
                .orderBy('age_min')
                .select('id', 'token', 'name', 'age_min', 'age_max');

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

            await cacheService.setCache(cache_key_kid_ages, ages_dict);

            module.exports.kidsAgeOptions = ages_dict;

            resolve(ages_dict);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
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

            let soloModeItem = Object.values(modesFilter?.items || {}).find(
                (item) => item.mode_token === 'mode-solo',
            );

            let partnerModeItem = Object.values(modesFilter?.items || {}).find(
                (item) => item.mode_token === 'mode-partner',
            );

            let kidsModeItem = Object.values(modesFilter?.items || {}).find(
                (item) => item.mode_token === 'mode-kids',
            );

            let exclude_send = new Set();
            let exclude_receive = new Set();

            if (!personSelectedModes.includes('mode-solo')) {
                exclude_send.add('mode-solo');
                exclude_receive.add('mode-solo');
            } else {
                if (!soloModeItem?.is_active || soloModeItem?.is_negative) {
                    if (modesFilter?.is_active) {
                        if (modesFilter?.is_send) {
                            exclude_send.add('mode-solo');
                        }

                        if (modesFilter?.is_receive) {
                            exclude_receive.add('mode-solo');
                        }
                    }
                }
            }

            if (!personSelectedModes.includes('mode-partner')) {
                exclude_send.add('mode-partner');
                exclude_receive.add('mode-partner');
            } else {
                hasValidPartner =
                    personModes?.partner &&
                    !personModes.partner.deleted &&
                    personModes.partner.gender_id;

                if (!hasValidPartner) {
                    exclude_send.add('mode-partner');
                    exclude_receive.add('mode-partner');
                }

                if (!partnerModeItem || !partnerModeItem.is_active || partnerModeItem.is_negative) {
                    if (modesFilter?.is_active) {
                        if (modesFilter.is_send) {
                            exclude_send.add('mode-partner');
                        }

                        if (modesFilter?.is_receive) {
                            exclude_receive.add('mode-partner');
                        }
                    }
                }
            }

            if (!personSelectedModes.includes('mode-kids')) {
                exclude_send.add('mode-kids');
                exclude_receive.add('mode-kids');
            } else {
                hasValidKid = Object.values(personModes.kids || {}).some(
                    (kid) => !kid.deleted && kid.gender_id && kid.age_id && kid.is_active,
                );

                if (!hasValidKid) {
                    exclude_send.add('mode-kids');
                    exclude_receive.add('mode-kids');
                }

                if (!kidsModeItem || !kidsModeItem.is_active || kidsModeItem.is_negative) {
                    if (modesFilter?.is_active) {
                        if (modesFilter?.is_send) {
                            exclude_send.add('mode-kids');
                        }

                        if (modesFilter?.is_receive) {
                            exclude_receive.add('mode-kids');
                        }
                    }
                }
            }

            resolve({
                send: exclude_send,
                receive: exclude_receive,
            });
        } catch (e) {
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
    kidsAgeOptions: null,
    kidsAgeLookup: null,
    getModeById,
    getModeByToken,
    getModes,
    getKidsAgeOptions,
    getKidsAgeLookup,
    getPersonExcludedModes,
    setKidAgesCache
};
