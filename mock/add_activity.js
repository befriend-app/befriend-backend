const axios = require('axios');
const yargs = require('yargs');
const dbService = require('../services/db');
const {getNetworkSelf} = require("../services/network");
const {loadScriptEnv, timeNow, getURL} = require("../services/shared");

let args = yargs.argv;

(async function() {
    loadScriptEnv();

    let login_token = args.lt;
    let person_token = args.pt;

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

        let r = await axios.post(activities_url, {
            person_token: person_token,
            login_token: login_token,
            activity: activity_insert
        });

        console.log(r);
        
    } catch(e) {
        console.error(e);
    }

    process.exit();
})();
