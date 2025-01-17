const axios = require('axios');
const yargs = require('yargs');
const dbService = require('../../services/db');
const encryptionService = require('../../services/encryption');
const { getNetworkSelf } = require('../../services/network');

const {
    loadScriptEnv,
    generateToken,
    timeNow,
    birthDatePure,
    calculateAge,
} = require('../../services/shared');

const { batchInsert } = require('../../services/db');
const cacheService = require('../../services/cache');
const { updatePerson } = require('../../services/persons');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000 * 50;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let max_request_count = 1000;

let self_network;

async function addPersons() {
    let conn = await dbService.conn();

    let current_count = 0;
    max_request_count = Math.min(num_persons, max_request_count);

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

        let results = r.data.results;

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
                    age: calculateAge(birthDatePure(person.dob.date)),
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

            await cacheService.deleteKeys([
                cacheService.keys.networks,
                cacheService.keys.networks_filters,
            ]);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

async function updateAge() {
    try {
        await cacheService.init();

        let conn = await dbService.conn();

        let persons = await conn('persons')
            .whereNull('age')
            .select('persons.id', 'persons.person_token', 'persons.age', 'persons.birth_date');

        for (let person of persons) {
            let age = calculateAge(person.birth_date);

            await updatePerson(person.person_token, {
                age,
            });
        }
    } catch (e) {
        console.error(e);
    }
}

async function main(qty) {
    if(qty) {
        num_persons = qty;
    }

    self_network = await getNetworkSelf();

    if (!self_network) {
        console.error('Network not setup: 1) Setup system: node setup 2) Start server: node server.js');
        process.exit(1);
    }

    try {
        await addPersons();
        await updateAge();
        await updatePersonsCount();
    } catch (e) {
        console.error(e);
    }
}

module.exports = { main };

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}
