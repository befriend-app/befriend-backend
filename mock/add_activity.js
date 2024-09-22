const axios = require('axios');
const yargs = require('yargs');
const dbService = require('../services/db');
const {getNetworkSelf} = require("../services/network");
const {loadScriptEnv, generateToken, timeNow, birthDatePure, encodePassword, joinPaths, getURL} = require("../services/shared");

let args = yargs.argv;

let num_persons = null;

if(args._ && args._.length) {
    person_token = args._[0];
}

(async function() {
    loadScriptEnv();
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    try {
        let activities_url = getURL(process.env.NETWORK_API_DOMAIN, 'persons/activities');

        let activity_insert = {
            activity_type_id: 1,
            location_lat: 41.299,
            location_lon: 43.174,
            location_name: "Capital One Cafe",
            activity_start: 10000,
            activity_duration_min: 60,
            no_end_time: true,
            number_persons: 5,
            is_public: true,
            is_new_friends: true,
            is_existing_friends: true,
            custom_filters: 1,
            created: timeNow(),
            updated: timeNow()
        }

        let login_token = "12345";

        let r = await axios.post(activities_url, {
            person_token: person_token,
            login_token: login_token,
            activity: activity_insert
        });

        
    } catch(e) {
        console.error(e);
    }

    process.exit();
})();
