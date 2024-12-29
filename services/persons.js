const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('../services/shared');
const { updateGridSets } = require('../services/filters');

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

                person = await cacheService.hGetAllObj(cache_key);

                if (person) {
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
                    .select(
                        'id',
                        'token',
                        'age_id',
                        'gender_id',
                        'is_active'
                    );

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
                    let grid = await conn('earth_grid').where('id', person.grid_id).first();

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
                    safety: person.rating_safety,
                    trust: person.rating_trust,
                    timeliness: person.rating_timeliness,
                    friendliness: person.rating_friendliness,
                    fun: person.rating_fun
                }

                await module.exports.savePerson(person.person_token, person);

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

                if (!person) {
                    return reject('No person found');
                }

                let conn = await dbService.conn();

                if ('modes' in data) {
                    await conn('persons').where('id', person.id).update({
                        modes: JSON.stringify(data.modes),
                        updated: timeNow(),
                    });

                    if (!('modes' in person) || person.modes === null) {
                        person.modes = {};
                    }

                    let prev_modes = person.modes.selected || [];

                    person.modes.selected = data.modes;

                    await updateGridSets(person, null, 'modes');

                    let new_modes = data.modes.filter(mode => !prev_modes.includes(mode));
                    let deselected_mode = prev_modes.find(mode => !data.modes.includes(mode));

                    //update grid cache sets
                    if(person.grid?.token) {
                        if(new_modes?.length) {
                            for(let new_mode of new_modes) {
                                let cache_key = cacheService.keys.persons_grid_set(person.grid.token, new_mode);
                                await cacheService.addItemToSet(cache_key, person.person_token);
                            }
                        } else if(deselected_mode) {
                            let cache_key = cacheService.keys.persons_grid_set(person.grid.token, deselected_mode);
                            await cacheService.removeMemberFromSet(cache_key, person.person_token);
                        }
                    }
                } else {
                    data.updated = timeNow();

                    //update db
                    await conn('persons').where('id', person.id).update(data);

                    //merge updated data for cache
                    Object.assign(person, data);

                    if('is_online' in data) {
                        await updateGridSets(person, null, 'online');
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
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
};
