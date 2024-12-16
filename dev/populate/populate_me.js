const axios = require('axios');
const yargs = require('yargs');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const { getNetworkSelf } = require('../../services/network');

const {
    loadScriptEnv,
} = require('../../services/shared');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let conn, self_network, persons_dict;

async function getPersonsLogins() {
    let persons = await conn('persons')
        .where('network_id', self_network.id);

    let persons_logins = await conn('persons_login_tokens')
        .whereIn('person_id', persons.map(item=>item.person_id));

    debugger;
}

(async function () {
    conn = await dbService.conn();
    self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node server.js',
        );
        process.exit(1);
    }

    await getPersonsLogins();



    process.exit();
})();
