const axios = require('axios');
const yargs = require('yargs');
const dayjs = require('dayjs');
const dbService = require('../../services/db');
const encryptionService = require('../../services/encryption');
const { getNetworkSelf } = require('../../services/network');

const { loadScriptEnv, generateToken, timeNow, birthDatePure, calculateAge } = require('../../services/shared');

const { batchInsert, batchUpdate } = require('../../services/db');
const cacheService = require('../../services/cache');
const { getPerson } = require('../../services/persons');
const { updateGridSets } = require('../../services/filters');
const { getReviews } = require('../../services/reviews');
const { getObj, hGetAllObj } = require('../../services/cache');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000 * 50;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let max_request_count = 1000;

function updatePersonsCount() {
    return new Promise(async (resolve, reject) => {
        try {
            let network_self = await getNetworkSelf();

            let conn = await dbService.conn();

            let persons = await conn('persons')
                .where('network_id', network_self.id)
                .whereNull('deleted')
                .select('id', 'network_id');

            await conn('networks').where('id', network_self.id).update({
                persons_count: persons.length,
                updated: timeNow(),
            });

            await cacheService.deleteKeys([cacheService.keys.networks, cacheService.keys.networks_filters]);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

(async function () {
    async function updateAgeSets() {
        try {
            await cacheService.init();

            let pipeline = cacheService.startPipeline();

            let conn = await dbService.conn();

            let persons = await conn('persons')
                .join('earth_grid as eg', 'eg.id', '=', 'persons.grid_id')
                .select('eg.token AS grid_token', 'persons.id', 'persons.person_token', 'persons.age', 'persons.birth_date');

            let batch_update = [];

            let cache_keys = {
                add: {},
                del: {},
            }

            for(let person of persons) {
                let prev_age = person.age;
                let age = calculateAge(person.birth_date);

                if(prev_age !== age || age === null) {
                    batch_update.push({
                        id: person.id,
                        age
                    });

                    person.age = age;

                    if(prev_age !== null) {
                        if(!cache_keys.del[person.grid_token]) {
                            cache_keys.del[person.grid_token] = []
                        }

                        cache_keys.del[person.grid_token].push(person);
                    }

                    if(!cache_keys.add[person.grid_token]) {
                        cache_keys.add[person.grid_token] = [];
                    }

                    cache_keys.add[person.grid_token].push(person);

                    pipeline.hSet(cacheService.keys.person(person.person_token), 'age', age?.toString() || '');
                }
            }

            for(let grid_token in cache_keys.del) {
                let grid_persons = cache_keys.del[grid_token];

                for(let person of grid_persons) {
                    let key = cacheService.keys.persons_grid_set(grid_token, 'age');
                    pipeline.zRem(key, person.person_token);
                }
            }

            for(let grid_token in cache_keys.add) {
                let grid_persons = cache_keys.add[grid_token];

                for(let person of grid_persons) {
                    let key = cacheService.keys.persons_grid_set(grid_token, 'age');

                    pipeline.zAdd(key, [
                        {
                            value: person.person_token,
                            score: person.age,
                        },
                    ],);
                }
            }

            await cacheService.execPipeline(pipeline);

            if(batch_update.length) {
                await batchUpdate('persons', batch_update);
            }
        } catch(e) {
            console.error(e);
        }
    }

    async function mockReviews() {
        let conn = await dbService.conn();

        let persons = await conn('persons')
            .whereNotNull('grid_id')
            .select('id', 'person_token');

        // Rating fields to update
        const ratingFields = [
            'rating_safety',
            'rating_trust',
            'rating_timeliness',
            'rating_friendliness',
            'rating_fun'
        ];

        let batch_update = [];

        for(let person of persons) {
            let update = {
                id: person.id,
                updated: timeNow()
            };

            for(let k of ratingFields) {
                update[k] = null;
            }

            let hasUpdates = false;

            // Add ratings for this person
            for(let field of ratingFields) {
                if(Math.random() <= 0.7) {
                    // Generate base rating biased towards 3.5-4.5 range
                    let rating;

                    if(Math.random() < 0.7) {
                        // 70% chance of 3.5-4.5 rating
                        rating = 3.5 + (Math.random() * 1.0);
                    } else if(Math.random() < 0.7) {
                        // 20% chance of 2.5-3.5 rating
                        rating = 2.5 + (Math.random() * 1.0);
                    } else {
                        // 10% chance of 1-2.5 rating
                        rating = 1.0 + (Math.random() * 1.5);
                    }

                    // Round to 1 decimal place
                    rating = Math.round(rating * 10) / 10;

                    update[field] = rating;
                    hasUpdates = true;
                }
            }

            if(hasUpdates) {
                batch_update.push(update);

                let person_obj = await hGetAllObj(cacheService.keys.person(person.person_token));

                let reviews = {
                    count: person_obj.count || 0,
                    safety: update.rating_safety,
                    trust: update.rating_trust,
                    timeliness: update.rating_timeliness,
                    friendliness: update.rating_friendliness,
                    fun: update.rating_fun
                }

                person_obj.reviews = reviews;

                await cacheService.hSet(cacheService.keys.person(person.person_token), 'reviews', reviews);

                await updateGridSets(person_obj, null, 'reviews');
            }
        }

        if(batch_update.length) {
            await batchUpdate('persons', batch_update);
        }
    }

    async function mockGenders() {
        try {
            await cacheService.init();

            let conn = await dbService.conn();

            let persons_qry = await conn('persons')
                .orderBy('id')
                .select('id', 'person_token');

            for(let p of persons_qry) {
                let person = await getPerson(p.person_token);

                await updateGridSets(person, null, 'genders');
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function addPersons() {
        let current_count = 0;

        let genders = await conn('genders');

        let genders_dict = {};

        for (let g of genders) {
            genders_dict[g.gender_name.toLowerCase()] = g.id;
        }

        try {
            let prev_highest_id = (await conn('persons').orderBy('id', 'desc').first())?.id || null;

            let r = await axios.get(
                `https://randomuser.me/api/?results=${Math.min(num_persons, max_request_count)}`,
            );

            results = r.data.results;

            let person_password = await encryptionService.hash('password');

            while (current_count < num_persons) {
                let batch_insert = [];
                let person_network_insert = [];

                for (let i = 0; i < results.length; i++) {
                    let id = i + 1 + current_count;

                    if (prev_highest_id) {
                        id += prev_highest_id;
                    }

                    let person = results[i];

                    if (!(person.gender in genders_dict)) {
                        continue;
                    }

                    let gender_id = genders_dict[person.gender.toLowerCase()];

                    let lat = 41.881;
                    let lon = -87.624;
                    // let lat = getRandomInRange(-180, 180, 4);
                    // let lon = getRandomInRange(-180, 180, 4);

                    let person_insert = {
                        person_token: generateToken(),
                        network_id: self_network.id,
                        first_name: person.name.first,
                        last_name: person.name.last,
                        gender_id: gender_id,
                        email: `user-${id}@befriend.app`,
                        password: person_password,
                        phone: person.phone,
                        is_online: true,
                        image_url: person.picture.large,
                        location_lat: lat,
                        location_lat_1000: Math.floor(parseFloat(lat) * 1000),
                        location_lon: lon,
                        location_lon_1000: Math.floor(parseFloat(lon) * 1000),
                        age: null, //todo
                        birth_date: birthDatePure(person.dob.date),
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    batch_insert.push(person_insert);
                }

                await batchInsert('persons', batch_insert, true);

                for (let person of batch_insert) {
                    person_network_insert.push({
                        person_id: person.id,
                        network_id: self_network.id,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }

                try {
                    await batchInsert('persons_networks', person_network_insert);
                } catch (e) {
                    console.error(e);
                }

                current_count += max_request_count;

                console.log({
                    current_count,
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    let results;
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node server.js',
        );
        process.exit(1);
    }

    try {
        await addPersons();
        await mockGenders();
        await mockReviews();
        // await updateAgeSets();
        await updatePersonsCount();
    } catch(e) {

    }

    process.exit();
})();
