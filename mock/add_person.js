const axios = require('axios');
const dbService = require('../services/db');
const {getNetworkSelf} = require("../services/network");
const {loadScriptEnv, generateToken, timeNow} = require("../services/shared");

let num_persons = 1;

(async function() {
    loadScriptEnv();
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    try {
        let r = await axios.get(`https://randomuser.me/api/?results=${num_persons}`);

        for(let person of r.data.results) {
            let gender_qry = await conn('genders')
                .where('gender_name', person.gender)
                .first();

            if(!gender_qry) {
                console.error("Missing gender row");
                continue;
            }

            let person_insert = {
                person_token: generateToken(),
                network_id: self_network.id,
                first_name: person.name.first,
                last_name: person.name.last,
                gender_id: gender_qry.id,
                email: person.email,
                password: person.login.sha256,
                phone: person.phone,
                is_online: true,
                image_url: person.picture.large,
                location_lat: person.location.coordinates.latitude,
                location_lon: person.location.coordinates.longitude,
                birth_date: person.dob.date.substring(0, 10),
                created: timeNow(),
                updated: timeNow()
            };

            await conn('persons')
                .insert(person_insert);

            console.log({
                person_inserted: person_insert
            });
        }
    } catch(e) {
        console.error(e);
    }
})();