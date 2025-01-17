const axios = require('axios');
const yargs = require('yargs');

const dbService = require('../../services/db');
const { getNetworkSelf } = require('../../services/network');
const { loadScriptEnv, timeNow, joinPaths } = require('../../services/shared');

loadScriptEnv();

let conn, self_network, persons;

let args = yargs.argv;

let num_persons = 1000;
let parallelCount = 30;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let chunks = [];
let personsLookup = {};

const helpers = {
    processBatch: async function (processFn) {
        let processed = 0;
        const total = persons.length;

        for (let chunk of chunks) {
            await Promise.all(
                chunk.map(async (person) => {
                    if (processed % 100 === 0) {
                        console.log({
                            processing: `${processed + 1}/${total}`,
                        });
                    }

                    processed++;

                    try {
                        await processFn(person);
                    } catch (error) {
                        console.error(
                            `Error processing person ${person.person_token}:`,
                            error.message,
                        );
                    }
                }),
            );
        }
    },
};

async function getPersonsLogins() {
    console.log({
        filter: 'logins',
    });

    let ts = timeNow();

    persons = await conn('persons').where('network_id', self_network.id).limit(num_persons);

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

    let processed = 0;

    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if (processed % 100 === 0) {
                    console.log({
                        processing: `${processed + 1}/${persons.length}`,
                    });
                }

                processed++;

                if (!persons_dict[person.id]) {
                    try {
                        let r = await axios.post(joinPaths(process.env.APP_URL, 'login'), {
                            email: person.email,
                            password: 'password',
                        });
                        persons_dict[person.id] = r.data.login_token;
                        person.login_token = r.data.login_token;
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    person.login_token = persons_dict[person.id];
                }

                personsLookup[person.id] = {
                    person_token: person.person_token,
                    login_token: person.login_token,
                };
            }),
        );
    }

    console.log({
        logins: timeNow() - ts,
    });
}

async function processAvailability() {
    console.log({ filter: 'availability_filter' });
    let ts = timeNow();

    // Default time slots that could be assigned
    const timeSlots = [
        { start: '09:00', end: '12:00' },
        { start: '12:00', end: '17:00' },
        { start: '17:00', end: '21:00' },
        { start: '19:00', end: '23:00' },
    ];

    // Late night/overnight slots
    const overnightSlots = [
        { start: '20:00', end: '02:00' },
        { start: '22:00', end: '04:00' },
    ];

    await helpers.processBatch(async (person) => {
        try {
            //set to available any time
            let availability = {};

            for (let day = 0; day < 7; day++) {
                availability[day] = {
                    isDisabled: false,
                    times: {},
                };

                availability[day].isAny = true;
            }

            // Send the availability update request
            await axios.put(joinPaths(process.env.APP_URL, '/filters/availability'), {
                login_token: person.login_token,
                person_token: person.person_token,
                availability: availability,
            });
        } catch (error) {
            console.error(
                `Error setting availability for person ${person.person_token}:`,
                error.message,
            );
        }
    });

    console.log({
        availability_filter: timeNow() - ts,
    });
}

async function main(qty) {
    if(qty) {
        num_persons = qty;
    }

    conn = await dbService.conn();
    self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node server.js',
        );
        process.exit(1);
    }

    await getPersonsLogins();

    await processAvailability();
}

module.exports = { main };

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}