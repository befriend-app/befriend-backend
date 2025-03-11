const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('../services/shared');
const { updateGridSets } = require('../services/filters');
const { getNetworksLookup } = require('./network');
const { getGridById } = require('./grid');
const { isNumeric, floatOrNull } = require('./shared');

module.exports = {
    minAge: 18,
    maxAge: 80, //if max filter age is set at 80, we include all ages above
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

                person = await cacheService.hGetAllObj(cache_key);

                //todo remove
                if (0 && person) {
                    return resolve(person);
                }

                let conn = await dbService.conn();

                //todo filter cols
                if (email) {
                    person = await conn('persons').where('email', email).first();
                } else {
                    person = await conn('persons').where('person_token', person_token).first();
                }

                if (!person) {
                    return resolve(null);
                }

                //devices
                person.devices = await conn('persons_devices').where('person_id', person.id);

                //networks
                let networks = new Set();

                let networks_qry = await conn('networks_persons').where('person_id', person.id);

                let networksLookup = await getNetworksLookup();

                for (let network of networks_qry) {
                    let token = networksLookup.byId[network.network_id]?.network_token;

                    if (token) {
                        networks.add(token);
                    }
                }

                person.networks = Array.from(networks);

                //modes
                let modes = [];

                try {
                    modes = person.modes ? JSON.parse(person.modes) : [];
                } catch (e) {
                    console.error('Error parsing modes:', e);
                    modes = [];
                }

                //add modes to person obj
                person.modes = {
                    selected: modes,
                    partner: {},
                    kids: {},
                };

                const partner = await conn('persons_partner')
                    .where('person_id', person.id)
                    .whereNull('deleted')
                    .select('id', 'token', 'gender_id')
                    .first();

                if (partner) {
                    person.modes.partner = partner;
                }

                const kids = await conn('persons_kids')
                    .where('person_id', person.id)
                    .whereNull('deleted')
                    .select('id', 'token', 'age_id', 'gender_id', 'is_active');

                // Convert kids array to object with token keys
                const kids_dict = {};

                for (const kid of kids) {
                    kids_dict[kid.token] = {
                        id: kid.id,
                        token: kid.token,
                        gender_id: kid.gender_id,
                        age_id: kid.age_id,
                        is_active: kid.is_active,
                    };
                }

                person.modes.kids = kids_dict;

                //add grid
                if (person.grid_id) {
                    let grid = await getGridById(person.grid_id);

                    if (grid) {
                        person.grid = {
                            id: grid.id,
                            token: grid.token,
                        };
                    }
                }

                //add reviews
                person.reviews = {
                    count: person.reviews_count || 0,
                    noShowPercent: floatOrNull(person.no_show_percent) || 0,
                    safety: floatOrNull(person.rating_safety),
                    trust: floatOrNull(person.rating_trust),
                    timeliness: floatOrNull(person.rating_timeliness),
                    friendliness: floatOrNull(person.rating_friendliness),
                    fun: floatOrNull(person.rating_fun),
                };

                await module.exports.savePerson(person.person_token, person);

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
    getBatchPersons: function (person_tokens) {
        return new Promise(async (resolve, reject) => {
            if (!person_tokens || !person_tokens.length) {
                return resolve({});
            }

            let unique_tokens = [];
            const personsMap = {};
            const missingTokens = [];

            for (const token of person_tokens) {
                if (!(token in personsMap)) {
                    personsMap[token] = null;
                    unique_tokens.push(token);
                }
            }

            // 1. Get persons from cache
            try {
                const pipeline = cacheService.startPipeline();

                for (let token of unique_tokens) {
                    let cache_key = cacheService.keys.person(token);
                    pipeline.hGetAll(cache_key);
                }

                const results = await cacheService.execPipeline(pipeline);

                for (let i = 0; i < results.length; i++) {
                    let result = results[i];
                    let token = unique_tokens[i];

                    try {
                        if (result && Object.keys(result).length) {
                            personsMap[token] = cacheService.parseHashData(result);
                        } else {
                            missingTokens.push(token);
                        }
                    } catch (e) {
                        console.error(e);
                        missingTokens.push(token);
                    }
                }

                //2. retrieve from DB if missing in cache
                if (missingTokens.length) {
                    const conn = await dbService.conn();

                    const persons = await conn('persons').whereIn('person_token', missingTokens);

                    //lookup
                    let personsLookup = {};

                    for (let p of persons) {
                        personsLookup[p.id] = p;
                    }

                    const personIds = persons.map((p) => p.id);

                    const [devices, partners, kids] = await Promise.all([
                        conn('persons_devices').whereIn('person_id', personIds),

                        conn('persons_partner')
                            .whereIn('person_id', personIds)
                            .whereNull('deleted')
                            .select('id', 'person_id', 'token', 'gender_id'),

                        conn('persons_kids')
                            .whereIn('person_id', personIds)
                            .whereNull('deleted')
                            .select('id', 'person_id', 'token', 'age_id', 'gender_id', 'is_active'),
                    ]);

                    let devicesLookup = {};

                    for (let d of devices) {
                        if (!devicesLookup[d.person_id]) {
                            devicesLookup[d.person_id] = [];
                        }

                        devicesLookup[d.person_id].push(d);
                    }

                    let partnersLookup = {};

                    for (let p of partners) {
                        partnersLookup[p.person_id] = p;
                    }

                    let kidsLookup = {};

                    for (let k of kids) {
                        if (!kidsLookup[k.person_id]) {
                            kidsLookup[k.person_id] = {};
                        }

                        kidsLookup[k.person_id][k.token] = {
                            id: k.id,
                            token: k.token,
                            gender_id: k.gender_id,
                            age_id: k.age_id,
                            is_active: k.is_active,
                        };
                    }

                    // Process each missing person
                    let pipeline = cacheService.startPipeline();

                    for (const person of persons) {
                        //devices
                        person.devices = devicesLookup[person.id] || [];

                        //modes
                        let selected_modes = [];
                        try {
                            selected_modes = person.modes ? JSON.parse(person.modes) : [];
                        } catch (e) {
                            console.error('Error parsing modes:', e);
                        }

                        person.modes = {
                            selected: selected_modes,
                            partner: partnersLookup[person.id] || {},
                            kids: kidsLookup[person.id] || {},
                        };

                        //grid
                        if (person.grid_id) {
                            let grid = await getGridById(person.grid_id);

                            if (grid) {
                                person.grid = {
                                    id: grid.id,
                                    token: grid.token,
                                };
                            }
                        }

                        //reviews
                        person.reviews = {
                            count: person.reviews_count || 0,
                            safety: person.rating_safety,
                            trust: person.rating_trust,
                            timeliness: person.rating_timeliness,
                            friendliness: person.rating_friendliness,
                            fun: person.rating_fun,
                        };

                        personsMap[person.person_token] = person;

                        const cacheKey = cacheService.keys.person(person.person_token);

                        let cachePerson = structuredClone(person);

                        cachePerson = cacheService.prepareSetHash(cachePerson);

                        pipeline.hSet(cacheKey, cachePerson);
                    }

                    await cacheService.execPipeline(pipeline);
                }
            } catch (e) {
                console.error(e);
                return reject(e);
            }

            resolve(personsMap);
        });
    },
    updatePerson: function (person_token, data) {
        return new Promise(async (resolve, reject) => {
            if (!person_token) {
                return reject('Person token required');
            }

            try {
                let person = await module.exports.getPerson(person_token);

                if (!person) {
                    return reject('No person found');
                }

                let conn = await dbService.conn();

                if ('modes' in data) {
                    await conn('persons')
                        .where('id', person.id)
                        .update({
                            modes: JSON.stringify(data.modes),
                            updated: timeNow(),
                        });

                    if (!('modes' in person) || person.modes === null) {
                        person.modes = {};
                    }

                    person.modes.selected = data.modes;

                    await updateGridSets(person, null, 'modes');
                } else {
                    data.updated = timeNow();

                    //update db
                    await conn('persons').where('id', person.id).update(data);

                    //merge updated data for cache
                    Object.assign(person, data);

                    if ('is_online' in data) {
                        await updateGridSets(person, null, 'online');
                    } else if ('gender_id' in data) {
                        await updateGridSets(person, null, 'genders');
                    }
                }

                await module.exports.savePerson(person_token, person);

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
    savePerson: function (person_token, data) {
        return new Promise(async (resolve, reject) => {
            try {
                let key = cacheService.keys.person(person_token);

                await cacheService.hSet(key, null, data);

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
};
