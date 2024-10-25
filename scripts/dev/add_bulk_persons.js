const axios = require('axios');
const yargs = require('yargs');
const dbService = require('../../services/db');
const { getNetworkSelf } = require('../../services/network');
const {
    loadScriptEnv,
    generateToken,
    timeNow,
    birthDatePure,
    encodePassword,
    getRandomInRange,
} = require('../../services/shared');
const { batchInsert } = require('../../services/db');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000 * 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let max_request_count = 1000;

(async function () {
    let results;
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    let current_count = 0;

    let genders = await conn('genders');

    let genders_dict = {};

    for (let g of genders) {
        genders_dict[g.gender_name.toLowerCase()] = g.id;
    }

    try {
        let r = await axios.get(
            `https://randomuser.me/api/?results=${Math.min(num_persons, max_request_count)}`,
        );

        results = r.data.results;

        let person_password = await encodePassword('password');

        while (current_count < num_persons) {
            current_count += max_request_count;

            console.log({
                current_count,
            });

            let batch_insert = [];
            let person_network_insert = [];

            for (let i = 0; i < results.length; i++) {
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
                    gender_id: gender_id.id,
                    email: person.email,
                    password: person_password,
                    phone: person.phone,
                    is_online: true,
                    image_url: person.picture.large,
                    location_lat: lat,
                    location_lat_1000: Math.floor(parseFloat(lat) * 1000),
                    location_lon: lon,
                    birth_date: birthDatePure(person.dob.date),
                    created: timeNow(),
                    updated: timeNow(),
                };

                batch_insert.push(person_insert);
            }

            let ids_output = await batchInsert(conn, 'persons', batch_insert);

            for (let ids of ids_output) {
                for (let person_id = ids[0]; person_id < ids[1]; person_id++) {
                    person_network_insert.push({
                        person_id: person_id,
                        network_id: self_network.id,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }
            }

            try {
                await batchInsert(conn, 'persons_networks', person_network_insert);
            } catch (e) {
                console.error(e);
            }
        }
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
