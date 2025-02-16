const yargs = require('yargs');
const dbService = require('../../services/db');
const { getNetworkSelf } = require('../../services/network');

const {
    loadScriptEnv,
    timeNow,
} = require('../../services/shared');

const { batchUpdate } = require('../../services/db');
const cacheService = require('../../services/cache');
const { updatePerson } = require('../../services/persons');
const { updateGridSets } = require('../../services/filters');
const { hGetAllObj } = require('../../services/cache');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

async function simulateIsNewPerson() {
    try {
        await cacheService.init();

        let conn = await dbService.conn();

        let persons_qry = await conn('persons AS p')
            .join('earth_grid AS eg', 'eg.id', '=', 'p.grid_id')
            .orderBy('p.id')
            .select('p.id', 'person_token', 'eg.token AS grid_token')
            .limit(num_persons);

        if (!persons_qry.length) {
            console.error(
                'No persons with grid exists. Run (1) dev->simulate->persons (2) dev->simulate->me',
            );
            process.exit(1);
        }

        let pipeline = cacheService.startPipeline();

        for (let p of persons_qry) {
            await updatePerson(p.person_token, {
                is_new: true,
            });

            let key = cacheService.keys.persons_grid_set(p.grid_token, 'is_new_person');
            pipeline.sAdd(key, p.person_token);
        }

        await cacheService.execPipeline(pipeline);
    } catch (e) {
        console.error(e);
    }
}

async function simulateReviews() {
    let conn = await dbService.conn();

    let persons = await conn('persons').whereNotNull('grid_id').select('id', 'person_token');

    // Rating fields to update
    const ratingFields = [
        'rating_safety',
        'rating_trust',
        'rating_timeliness',
        'rating_friendliness',
        'rating_fun',
    ];

    let batch_update = [];

    for (let person of persons) {
        let reviews_count = Math.floor(Math.random() * 10) + 1;

        let update = {
            id: person.id,
            reviews_count,
            updated: timeNow(),
        };

        for (let k of ratingFields) {
            update[k] = null;
        }

        // Add ratings for this person
        let baseRating;

        // Generate base rating biased towards 3.5-4.5 range
        if (Math.random() < 0.8) {
            // 80% chance of 4-5 rating
            baseRating = 4 + Math.random() * 1.0;
        } else if (Math.random() < 0.5) {
            // 10% chance of 2.5-3.5 rating
            baseRating = 2.5 + Math.random() * 1.0;
        } else {
            // 10% chance of 1-2.5 rating
            baseRating = 1.0 + Math.random() * 1.5;
        }

        for (let field of ratingFields) {
            let ratingPercent = 0.8 + Math.random() / 2;
            ratingPercent = Math.min(ratingPercent, 1);

            // Round to 1 decimal place
            update[field] = Math.round(baseRating * ratingPercent * 10) / 10;
        }

        batch_update.push(update);

        let person_obj = await hGetAllObj(cacheService.keys.person(person.person_token));

        let reviews = {
            count: reviews_count,
            safety: update.rating_safety,
            trust: update.rating_trust,
            timeliness: update.rating_timeliness,
            friendliness: update.rating_friendliness,
            fun: update.rating_fun,
        };

        person_obj.reviews = reviews;

        await cacheService.hSet(
            cacheService.keys.person(person.person_token),
            'reviews',
            reviews,
        );

        await updateGridSets(person_obj, null, 'reviews');
    }

    if (batch_update.length) {
        await batchUpdate('persons', batch_update);
    }
}

async function main(qty) {
    if(qty) {
        num_persons = qty;
    }

    let self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node servers',
        );

        process.exit(1);
    }

    try {
        await simulateIsNewPerson();
        await simulateReviews();
    } catch (e) {
        console.error(e);
    }
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
