const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');
const { getModes } = require('./modes');

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

                let modes = await getModes();

                //add person modes to obj
                person.mode = {
                    id: person.mode_id,
                    token: modes?.byId[person.mode_id]?.token || null,
                    partner: {},
                    kids: {}
                };

                // Get partner data
                const partner = await conn('persons_partner')
                    .where('person_id', person.id)
                    .whereNull('deleted')
                    .select('id', 'token', 'gender_id', 'created', 'updated')
                    .first();

                if (partner) {
                    person.mode.partner = partner;
                }

                // Get kids data
                const kids = await conn('persons_kids')
                    .where('person_id', person.id)
                    .whereNull('deleted')
                    .select('id', 'token', 'age_id', 'gender_id', 'is_active', 'created', 'updated');

                // Convert kids array to object with token keys
                const kids_dict = {};

                for (const kid of kids) {
                    kids_dict[kid.token] = {
                        id: kid.id,
                        token: kid.token,
                        gender_id: kid.gender_id,
                        age_id: kid.age_id,
                        is_active: kid.is_active
                    };
                }
                person.mode.kids = kids_dict;

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

                if (!person) {
                    return reject('No person found');
                }

                //use cached data
                let cache_key = cacheService.keys.person(person_token);

                let conn = await dbService.conn();

                if('mode' in data) {
                    await conn('persons')
                        .where('id', person.id)
                        .update({
                            mode_id: data.mode.id,
                            updated: timeNow()
                        });

                    if(!('mode' in person)) {
                        person.mode = {};
                    }

                    Object.assign(person.mode, {
                        id: data.mode.id,
                        token: data.mode.token
                    });
                } else {
                    data.updated = timeNow();

                    await conn('persons')
                        .where('id', person.id)
                        .update(data);

                    Object.assign(person, data);
                }

                await cacheService.setCache(cache_key, person);

                resolve(person);
            } catch (e) {
                reject(e);
            }
        });
    },
};
