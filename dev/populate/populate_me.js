const axios = require('axios');
const yargs = require('yargs');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const { getNetworkSelf } = require('../../services/network');

const {
    loadScriptEnv, timeNow, joinPaths,
} = require('../../services/shared');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let conn, self_network, persons_dict;

let parallelCount = 20;

async function getPersonsLogins() {
    //todo remove
    await conn('persons_login_tokens')
        .delete();

    let t = timeNow();
    let persons = await conn('persons')
        .where('network_id', self_network.id)
        .limit(num_persons);

    let persons_logins = await conn('persons_login_tokens')
        .whereIn('person_id', persons.map(item=>item.id));

    persons_dict = persons_logins.reduce((acc, item) => {
        acc[item.person_id] = item.login_token;
        return acc;
    }, {});

    const chunks = [];

    for (let i = 0; i < persons.length; i += parallelCount) {
        chunks.push(persons.slice(i, i + parallelCount));
    }

    for (let chunk of chunks) {
        await Promise.all(chunk.map(async person => {
            if (!persons_dict[person.id]) {
                let r = await axios.post(joinPaths(process.env.APP_URL, 'login'), {
                    email: person.email,
                    password: 'password'
                });
                persons_dict[person.id] = r.data.login_token;
            }
        }));
    }

    console.log(timeNow() - t);
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
