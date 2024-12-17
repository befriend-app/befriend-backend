const axios = require('axios');
const yargs = require('yargs');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const meService = require('../../services/me');

const { getNetworkSelf } = require('../../services/network');

const { loadScriptEnv, timeNow, joinPaths, shuffleFunc } = require('../../services/shared');
const { getSections, modes } = require('../../services/me');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let conn, self_network, persons;

let parallelCount = 20;

let timing = {
    section_1: 0,
    section_2: 0
}

let chunks = [];

async function getPersonsLogins() {
    let t = timeNow();

    persons = await conn('persons')
        .where('network_id', self_network.id)
        .limit(num_persons);

    let persons_logins = await conn('persons_login_tokens').whereIn(
        'person_id',
        persons.map((item) => item.id),
    );

    let persons_dict = persons_logins.reduce((acc, item) => {
        acc[item.person_id] = item.login_token;
        return acc;
    }, {});

    for (let i = 0; i < persons.length; i += parallelCount) {
        chunks.push(persons.slice(i, i + parallelCount));
    }

    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if (!persons_dict[person.id]) {
                    let r = await axios.post(joinPaths(process.env.APP_URL, 'login'), {
                        email: person.email,
                        password: 'password',
                    });
                    persons_dict[person.id] = r.data.login_token;
                    person.login_token = r.data.login_token;
                } else {
                    person.login_token = persons_dict[person.id];
                }
            }),
        );
    }
}

async function processSections() {
    //fill 70% of sections
    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                let ts = timeNow();
                let sections = await getSections(person);

                timing.section_1 += timeNow() - ts;

                let all_keys = Object.keys(sections.all);
                let active_keys = Object.keys(sections.active);

                let changed = false;

                while ((active_keys.length / all_keys.length) < .7) {
                    let options = all_keys.filter(item => !active_keys.includes(item));

                    let key = shuffleFunc(options)[0];

                    let r = await axios.post(joinPaths(process.env.APP_URL, '/me/sections'), {
                        key,
                        person_token: person.person_token,
                        login_token: person.login_token,
                    });

                    active_keys.push(key);

                    changed = true;
                }

                if(changed) {
                    person.sections = await getSections(person);
                } else {
                    person.sections = sections;
                }
            }),
        );
    }
}

async function processModes() {
    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if(person.mode === null) {
                    let newMode = shuffleFunc(modes)
                }
                debugger;
                let r = await axios.post(joinPaths(process.env.APP_URL, '/me/sections'), {
                    key,
                    person_token: person.person_token,
                    login_token: person.login_token,
                });

            }),
        );
    }
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

    let t = timeNow();
    //sections
    await processSections();

    console.log(timeNow() - t);

    //mode
    await processModes();

    //movies

    //tv shows

    //sports

    //music

    //instruments

    //schools

    //work

    //life stage

    //relationship status

    //languages

    //politics

    //religion

    //drinking

    //smoking

    process.exit();
})();
