const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('../services/shared');
const { updateGridSets } = require('../services/filters');
const { getNetworksLookup, getNetworkSelf, registerNewPersonHomeDomain, storeProfilePictureHomeDomain } = require('./network');
const { getGridById } = require('./grid');
const { floatOrNull, generateToken, isValidBase64Image, uploadS3Key, joinPaths } = require('./shared');
const { createLoginToken } = require('./account');
const { getGendersLookup } = require('./genders');
const process = require('process');

module.exports = {
    minAge: 18,
    maxAge: 80, //if max filter age is set at 80, we include all ages above
    validation: {
        firstName: {
            maxLength: 50
        },
        lastName: {
            maxLength: 50
        },
    },
    createPerson: function(phoneObj, email, autoLogin) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();
                let network = await getNetworkSelf();

                //create unique person token
                let personToken = generateToken();
                let loginToken = null;
                let created = timeNow();

                //set solo mode by default
                let modes = ['mode-solo'];

                //insert into persons table
                let person_insert = {
                    registration_network_id: network.id,
                    is_person_known: network.is_befriend,
                    is_new: true,
                    person_token: personToken,
                    email: email || null,
                    phone: phoneObj?.number || null,
                    phone_country_code: phoneObj?.countryCode || null,
                    is_online: true,
                    modes: JSON.stringify(modes),
                    created,
                    updated: created,
                };

                let [person_id] = await conn('persons')
                    .insert(person_insert);

                //insert into networks_persons table
                let networkPersonInsert = {
                    network_id: network.id,
                    person_id: person_id,
                    is_active: true,
                    created,
                    updated: created,
                };

                await conn('networks_persons').insert(
                    networkPersonInsert
                );

                if(autoLogin) {
                    loginToken = await createLoginToken({
                        id: person_id,
                        person_token: personToken
                    });
                }

                //resolve early to finish request while registering with home domain process continues
                resolve({
                    person_token: personToken,
                    login_token: loginToken
                });

                //notify home domain network of new person registration
                await registerNewPersonHomeDomain({
                    id: person_id,
                    person_token: personToken,
                    updated: created,
                });
            } catch(e) {
                console.error(e);
                return reject();
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

                //set custom fields
                person.country = null;

                if(person.email && !person.password) {
                    person.needs_password = true;
                }

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
    setInitProfile: function (person_token, picture, first_name, last_name, gender_token, birthday) {
        return new Promise(async (resolve, reject) => {
            let errors = [];

            try {
                //validation

                //picture (required)
                //currently any photo will pass
                //possible todo, face recognition
                //would require user notice on screen to accept use of face recognition

                if(!picture || typeof picture !== 'string') {
                    errors.push('Picture required');
                } else if(!isValidBase64Image(picture)) {
                    errors.push('Invalid picture format provided');
                }

                //first_name (required)
                if(!first_name || typeof first_name !== 'string') {
                    errors.push('First name required');
                }

                if(first_name.length > module.exports.validation.firstName.maxLength) {
                    errors.push(`First name character limit: ${module.exports.validation.firstName.maxLength} characters`);
                }

                //last_name (optional)
                if(last_name && typeof last_name !== 'string') {
                    errors.push('Invalid last name');
                }

                if(last_name.length > module.exports.validation.lastName.maxLength) {
                    errors.push(`Last name character limit: ${module.exports.validation.lastName.maxLength} characters`);
                }

                //gender_token (required)
                let gendersDict = await getGendersLookup();

                if(!gendersDict.byToken[gender_token]) {
                    errors.push('Gender required');
                }

                //birthday (required)
                //must be 18 or older
                let birthdayValidation = module.exports.validateMinimumAge(birthday);

                if(!birthdayValidation.isValid) {
                    errors.push(birthdayValidation.error);
                }

                if(errors.length) {
                    let errors_str = errors.join(', ');
                    errors_str = errors_str.toLowerCase();
                    errors_str = errors_str.capitalize();

                    return reject({
                        message: errors_str
                    });
                }

                //return properties
                //image_url, first_name, last_name, gender_id, birth_date (formatted), age
                let image_url = null;

                let network = await getNetworkSelf();

                //image
                //if aws keys and s3_url set, use own storage
                //otherwise send to befriend for storage and return of url

                if(network.is_befriend ||
                    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET)) {
                    let base64Data = picture.replace(/^data:image\/\w+;base64,/, '');
                    let buffer = Buffer.from(base64Data, 'base64');

                    let subDir = network.network_token;
                    let baseName = person_token;

                    let s3Key = `profiles/${subDir}/${baseName}.jpg`;

                    await uploadS3Key(process.env.S3_BUCKET, s3Key, null, buffer, 'image/jpeg');

                    image_url = joinPaths(process.env.S3_URL, s3Key);
                } else {
                    try {
                        image_url = await storeProfilePictureHomeDomain(person_token, picture);
                    } catch(e) {
                        console.error(e);
                    }
                }

                let gender = gendersDict.byToken[gender_token];
                let birth_date_str = birthdayValidation.date.format('YYYY-MM-DD');
                let age = birthdayValidation.age;

                let updateData = {
                    image_url,
                    first_name,
                    last_name: last_name || null,
                    gender_id: gender.id,
                    birth_date: birth_date_str,
                    age,
                    updated: timeNow()
                };

                try {
                     let conn = await dbService.conn();

                     await conn('persons')
                         .where('person_token', person_token)
                         .update(updateData);
                } catch(e) {
                    console.error(e);
                }

                resolve(updateData);
            } catch(e) {
                console.error(e);

                return reject({
                    message: 'Unknown error saving profile'
                });
            }
        });
    },
    calculateAge: function (birthday) {
        let dayjs = require('dayjs');

        let result = {
            isValid: false,
            age: null,
            error: null
        };

        // Validate birthday input
        if (!birthday?.month || !birthday?.day || !birthday?.year) {
            result.error = 'Invalid birthday provided';
            return result;
        }

        try {
            let birthDate = dayjs(`${birthday.year}-${birthday.month}-${birthday.day}`);

            // Check if the date is valid
            if (!birthDate.isValid()) {
                result.error = 'Invalid date created from birthday';
                return result;
            }

            // Get current date
            let today = dayjs();

            // Calculate age
            let age = today.year() - birthDate.year();

            // Adjust age if birthday hasn't occurred yet this year
            let hasBirthdayOccurredThisYear =
                today.month() + 1 > birthDate.month() ||
                (today.month() + 1 === birthDate.month() && today.date() >= birthDate.date());

            if (!hasBirthdayOccurredThisYear) {
                age--;
            }

            // Ensure age is not negative
            if (age < 0) {
                result.error = 'Birthday is in the future';
                return result;
            }

            // Set success result
            result.isValid = true;
            result.age = age;
            result.date = birthDate;

            return result;
        } catch (error) {
            result.error = error.message || 'Error calculating age';
            return result;
        }
    },
    validateMinimumAge: function(birthday) {
        let minimumAge = module.exports.minAge;

        // Get age calculation result
        let ageResult = module.exports.calculateAge(birthday);

        // Initialize result
        let result = {
            isValid: ageResult.isValid,
            meetsMinimumAge: false,
            age: ageResult.age,
            date: ageResult.date,
            error: ageResult.error
        };

        // Check if age calculation was successful
        if (!ageResult.isValid) {
            return result;
        }

        // Check if user meets minimum age requirement
        result.meetsMinimumAge = ageResult.age >= minimumAge;

        // Add specific error for minimum age requirement
        if (!result.meetsMinimumAge) {
            result.error = `User must be at least ${minimumAge} years old`;
        }

        return result;
    }
};
