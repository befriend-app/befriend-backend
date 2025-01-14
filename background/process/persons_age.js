const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { isPersonAvailable } = require('../../services/availability');
const { timeNow, loadScriptEnv, calculateAge } = require('../../services/shared');
const { getNetworkSelf } = require('../../services/network');
const { batchUpdate } = require('../../services/db');

loadScriptEnv();

const UPDATE_FREQUENCY = 3600 * 24 * 1000; //runs every day
const BATCH_SIZE = 50000;

function processUpdate() {
    return new Promise(async (resolve, reject) => {
        try {
            let t = timeNow();

            let my_network = await getNetworkSelf();

            let conn = await dbService.conn();

            let hasMorePersons = true;
            let offset = 0;

            while (hasMorePersons) {
                try {
                    let persons = await conn('persons')
                        .where('network_id', my_network.id)
                        .orderBy('id')
                        .select('id', 'person_token', 'birth_date', 'age')
                        .offset(offset)
                        .limit(BATCH_SIZE);

                    if (!persons.length) {
                        hasMorePersons = false;
                    }

                    offset += BATCH_SIZE;

                    let batch_update = [];
                    let pipeline = cacheService.startPipeline();

                    for (let person of persons) {
                        let new_age = calculateAge(person.birth_date);

                        if (person.age !== new_age) {
                            batch_update.push({
                                id: person.id,
                                age: new_age,
                                updated: timeNow(),
                            });
                        }

                        pipeline.hSet(
                            cacheService.keys.person(person.person_token),
                            'age',
                            new_age.toString(),
                        );
                    }

                    if (batch_update.length) {
                        await batchUpdate('persons', batch_update);
                        await cacheService.execPipeline(pipeline);
                    }
                } catch (e) {
                    console.error(e);
                    hasMorePersons = false;
                }
            }

            console.log({
                total_time: timeNow() - t,
            });
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

async function startProcess() {
    await cacheService.init();

    processUpdate();

    setInterval(processUpdate, UPDATE_FREQUENCY);
}

(async function () {
    startProcess();
})();
