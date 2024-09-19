const axios = require('axios');

const dbService = require('../services/db');

const {loadScriptEnv, timeoutAwait} = require("../services/shared");
const {getNetworkSelf} = require("../services/network");
const {setCache} = require("../services/cache");

const runInterval = 3600 * 1000; //every hour

(async function() {
    loadScriptEnv();

    while(true) {
        try {
            let conn = await dbService.conn();
        } catch(e) {
            console.error(e);
        }

        await timeoutAwait(runInterval);
    }
})();