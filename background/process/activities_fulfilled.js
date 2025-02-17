const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const { timeNow, loadScriptEnv, timeoutAwait, getDateTimeStr } = require('../../services/shared');
const { getNetworkSelf } = require('../../services/network');
const { rules } = require('../../services/activities');
const { batchUpdate } = require('../../services/db');

loadScriptEnv();

const UPDATE_FREQUENCY = 60 * 10 * 1000; //runs every 10 minutes

let self_network;

//this process sets the status of an activity to fulfilled/unfulfilled, allowing users to later create new activities during the same time periods

function processUpdate() {
    return new Promise(async (resolve, reject) => {
        try {
            let t = timeNow(true);

            let conn = await dbService.conn();

            let acceptanceThreshold = rules.unfulfilled.acceptance.minsThreshold * 60;
            let noShowThreshold = rules.unfulfilled.noShow.minsThreshold * 60;

            let activities = await conn('activities AS a')
                .join('persons AS p', 'p.id', '=', 'a.person_id')
                .join('activities_persons AS ap', 'ap.activity_id', '=', 'a.id')
                .whereNull('a.is_fulfilled')
                .select(
                    'a.id',
                    'a.activity_token',
                    'a.person_id as person_id_from',
                    'ap.person_id AS person_id_to',
                    'a.activity_start',
                    'a.activity_end',
                    'a.activity_duration_min',
                    'ap.arrived_at',
                    'ap.cancelled_at',
                    'ap.left_at',
                    'ap.is_creator',
                    'p.person_token'
                );

            let activitiesOrganized = {};
            let activityLookupMap = {};

            for(let activity of activities) {
                activityLookupMap[activity.id] = {
                    activity_token: activity.activity_token,
                    person_token: activity.person_token,
                }

                if (!activitiesOrganized[activity.id]) {
                    activitiesOrganized[activity.id] = {
                        id: activity.id,
                        activity_token: activity.activity_token,
                        person_id_from: activity.person_id_from,
                        activity_start: activity.activity_start,
                        activity_end: activity.activity_end,
                        persons: []
                    };
                }

                activitiesOrganized[activity.id].persons.push({
                    person_id: activity.person_id_to,
                    arrived_at: activity.arrived_at,
                    cancelled_at: activity.cancelled_at,
                    left_at: activity.left_at,
                    is_creator: activity.is_creator
                });
            }

            let batch_update = [];

            for (let activityId in activitiesOrganized) {
                let activity = activitiesOrganized[activityId];

                //perform logic only after acceptance threshold
                if (!(activity.activity_start + acceptanceThreshold < t)) {
                    continue;
                }

                //filter out cancelled participants
                let activeParticipants = activity.persons.filter(p =>
                    !p.cancelled_at
                );

                let participantsWithoutCreator = activeParticipants.filter(p =>
                    !p.is_creator
                );

                if(!participantsWithoutCreator.length) { //set to unfulfilled if zero participants
                    batch_update.push({
                        id: activity.id,
                        is_fulfilled: false,
                        updated: timeNow()
                    });
                } else if((activity.activity_start + noShowThreshold) < t) { //perform logic after no show threshold
                    //count participants who arrived
                    let arrivedParticipants = activeParticipants.filter(p =>
                        p.arrived_at
                    );

                    batch_update.push({
                        id: activity.id,
                        is_fulfilled: arrivedParticipants.length >= 2,
                        updated: timeNow()
                    });
                }
            }

            if(batch_update.length) {
                try {
                    await batchUpdate('activities', batch_update);
                } catch(e) {
                    console.error(e);
                }

                let pipeline = cacheService.startPipeline();

                for(let activity of batch_update) {
                    let data = activityLookupMap[activity.id];

                    pipeline.hGet(cacheService.keys.activities(data.person_token), data.activity_token);
                }

                try {
                    let results = await cacheService.execPipeline(pipeline);

                    let idx = 0;

                    pipeline = cacheService.startPipeline();

                    for(let activity of batch_update) {
                        let data = activityLookupMap[activity.id];

                        let activityData = JSON.parse(results[idx++]);

                        activityData.is_fulfilled = activity.is_fulfilled;
                        pipeline.hSet(cacheService.keys.activities(data.person_token), data.activity_token, JSON.stringify(activityData));
                    }

                    await cacheService.execPipeline(pipeline);
                } catch(e) {
                    console.error(e);
                }

                console.log({
                    process_update: {
                        time: getDateTimeStr(),
                        name: 'activity_fulfilled',
                        count: batch_update.length,
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

async function main() {
    await cacheService.init();

    try {
        self_network = await getNetworkSelf();

        if (!self_network) {
            throw new Error();
        }
    } catch (e) {
        console.error('Error getting own network', e);
        await timeoutAwait(5000);
        process.exit();
    }

    await processUpdate();

    setInterval(processUpdate, UPDATE_FREQUENCY);
}

module.exports = {
    main
}

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}