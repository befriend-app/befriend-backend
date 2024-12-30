const axios = require('axios');
const yargs = require('yargs');
const dayjs = require('dayjs');
const dbService = require('../../services/db');
const encryptionService = require('../../services/encryption');
const { getNetworkSelf } = require('../../services/network');

const { loadScriptEnv, generateToken, timeNow, birthDatePure, calculateAge } = require('../../services/shared');

const { batchInsert, batchUpdate } = require('../../services/db');
const cacheService = require('../../services/cache');
const { getPerson, updatePerson } = require('../../services/persons');
const { updateGridSets } = require('../../services/filters');
const { getReviews } = require('../../services/reviews');
const { getObj, hGetAllObj } = require('../../services/cache');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000 * 50;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let max_request_count = 1000;

(async function () {
    async function mockIsNewPerson() {
        try {
            await cacheService.init();

            let conn = await dbService.conn();

            let persons_qry = await conn('persons AS p')
                .join('earth_grid AS eg', 'eg.id', '=', 'p.grid_id')
                .orderBy('p.id')
                .select('p.id', 'person_token', 'eg.token')
                .limit(num_persons);

            if(!persons_qry.length) {
                console.error("No persons with grid exists. Run (1) dev->mock->persons (2) dev->mock->me");
                process.exit(1);
            }

            let pipeline = cacheService.startPipeline();

            for(let p of persons_qry) {
                await updatePerson(p.person_token, {
                    is_new: true,
                });

                let key = cacheService.keys.persons_grid_set(p.token, 'is_new_person');
                pipeline.sAdd(key, p.person_token);
            }

            await cacheService.execPipeline(pipeline);
        } catch (e) {
            console.error(e);
        }
    }

    async function mockReviews() {
        let conn = await dbService.conn();

        let persons = await conn('persons')
            .whereNotNull('grid_id')
            .select('id', 'person_token');

        // Rating fields to update
        const ratingFields = [
            'rating_safety',
            'rating_trust',
            'rating_timeliness',
            'rating_friendliness',
            'rating_fun'
        ];

        let batch_update = [];

        for(let person of persons) {
            let update = {
                id: person.id,
                updated: timeNow()
            };

            for(let k of ratingFields) {
                update[k] = null;
            }

            let hasUpdates = false;

            // Add ratings for this person
            for(let field of ratingFields) {
                if(Math.random() <= 0.7) {
                    // Generate base rating biased towards 3.5-4.5 range
                    let rating;

                    if(Math.random() < 0.7) {
                        // 70% chance of 3.5-4.5 rating
                        rating = 3.5 + (Math.random() * 1.0);
                    } else if(Math.random() < 0.7) {
                        // 20% chance of 2.5-3.5 rating
                        rating = 2.5 + (Math.random() * 1.0);
                    } else {
                        // 10% chance of 1-2.5 rating
                        rating = 1.0 + (Math.random() * 1.5);
                    }

                    // Round to 1 decimal place
                    rating = Math.round(rating * 10) / 10;

                    update[field] = rating;
                    hasUpdates = true;
                }
            }

            if(hasUpdates) {
                batch_update.push(update);

                let person_obj = await hGetAllObj(cacheService.keys.person(person.person_token));

                let reviews = {
                    count: person_obj.count || 0,
                    safety: update.rating_safety,
                    trust: update.rating_trust,
                    timeliness: update.rating_timeliness,
                    friendliness: update.rating_friendliness,
                    fun: update.rating_fun
                }

                person_obj.reviews = reviews;

                await cacheService.hSet(cacheService.keys.person(person.person_token), 'reviews', reviews);

                await updateGridSets(person_obj, null, 'reviews');
            }
        }

        if(batch_update.length) {
            await batchUpdate('persons', batch_update);
        }
    }

    let self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node server.js',
        );
        process.exit(1);
    }

    try {
        await mockIsNewPerson();
        await mockReviews();
    } catch(e) {
        console.error(e);
    }

    process.exit();
})();
