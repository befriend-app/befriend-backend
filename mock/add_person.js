const dbService = require('../services/db');
const {getNetworkSelf} = require("../services/network");

let num_persons = 1;

(async function() {
    let conn = await dbService.conn();
    let self_network = await getNetworkSelf();

    for(let i = 0; i < num_persons; i++) {
        let person_insert = {};
    }
})();