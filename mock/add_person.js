const axios = require("axios");
const yargs = require("yargs");
const dbService = require("../services/db");
const { getNetworkSelf } = require("../services/network");
const { loadScriptEnv, generateToken, timeNow, birthDatePure, encodePassword } = require("../services/shared");

let args = yargs.argv;

let num_persons = 1;

if (args._ && args._.length) {
    num_persons = args._[0];
}

(async function () {
    loadScriptEnv();
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    try {
        let r = await axios.get(`https://randomuser.me/api/?results=${num_persons}`);

        for (let person of r.data.results) {
            let gender_qry = await conn("genders").where("gender_name", person.gender).first();

            if (!gender_qry) {
                console.error("Missing gender row");
                continue;
            }

            let person_password = await encodePassword("password");

            let person_insert = {
                person_token: generateToken(),
                network_id: self_network.id,
                first_name: person.name.first,
                last_name: person.name.last,
                gender_id: gender_qry.id,
                email: person.email,
                password: person_password,
                phone: person.phone,
                is_online: true,
                image_url: person.picture.large,
                location_lat: person.location.coordinates.latitude,
                location_lat_1000: Math.floor(parseFloat(person.location.coordinates.latitude) * 1000),
                location_lon: person.location.coordinates.longitude,
                birth_date: birthDatePure(person.dob.date),
                created: timeNow(),
                updated: timeNow(),
            };

            let person_id = await conn("persons").insert(person_insert);

            person_id = person_id[0];

            await conn("persons_networks").insert({
                person_id: person_id,
                network_id: self_network.id,
                created: timeNow(),
                updated: timeNow(),
            });

            console.log({
                person_inserted: person_insert,
            });
        }
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
