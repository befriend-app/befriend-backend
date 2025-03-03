const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');
const {
    timeNow,
    getURL,
    joinPaths,
    loadScriptEnv,
    timeoutAwait,
} = require('../../../services/shared');

const { getNetworkSelf, getSecretKeyToForNetwork } = require('../../../services/network');
const {
    keys: systemKeys,
    getNetworkSyncProcess,
    setNetworkSyncProcess,
} = require('../../../services/system');
const { batchUpdate } = require('../../../services/db');

const batch_process = 1000;
const defaultTimeout = 20000;

let debug_sync_enabled = require('../../../dev/debug').sync.activities;

let network_self;

function syncActivities() {
    console.log('Sync: activities');

    const sync_name = systemKeys.sync.network.activities;

    return new Promise(async (resolve, reject) => {
        try {
            network_self = await getNetworkSelf();
        } catch (e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject();
        }

        try {
            let conn = await dbService.conn();

            let networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);

            for (let network of networks) {
                try {
                    let t = timeNow();
                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let sync_qry = await getNetworkSyncProcess(sync_name, network.id);

                    if (sync_qry && !debug_sync_enabled) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let secret_key_to = await getSecretKeyToForNetwork(network.id);

                    if (!secret_key_to) {
                        continue;
                    }

                    let axiosInstance = axios.create({
                        timeout: defaultTimeout,
                    });

                    let activities_url = getURL(
                        network.api_domain,
                        joinPaths('sync', 'activities'),
                    );

                    let response = await axiosInstance.get(activities_url, {
                        params: {
                            secret_key: secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow(),
                        },
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    let success = await processActivities(network.id, response.data.activities);

                    if (!success) {
                        skipSaveTimestamps = true;
                    }

                    while (response.data.pagination_updated) {
                        try {
                            response = await axiosInstance.get(activities_url, {
                                params: {
                                    secret_key: secret_key_to,
                                    network_token: network_self.network_token,
                                    pagination_updated: response.data.pagination_updated,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow(),
                                },
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            success = await processActivities(network.id, response.data.activities);

                            if (!success) {
                                skipSaveTimestamps = true;
                            }
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        let sync_update = {
                            sync_process: sync_name,
                            network_id: network.id,
                            last_updated: timestamps.current,
                            created: sync_qry ? sync_qry.created : timeNow(),
                            updated: timeNow(),
                        };

                        await setNetworkSyncProcess(sync_name, network.id, sync_update);
                    }

                    console.log({
                        process_time: timeNow() - t,
                    });
                } catch (e) {
                    console.error('Error syncing with network:', e);
                }
            }
        } catch (e) {
            console.error('Error in syncActivities:', e);
            return reject(e);
        }

        resolve();
    });
}

function processActivities(network_id, activities) {
    return new Promise(async (resolve, reject) => {
        if (!activities) {
            return resolve();
        }

        if (!activities.length) {
            return resolve(true);
        }

        if (activities.length > 50000) {
            console.error('Response too large, check network data');
            return resolve();
        }

        let has_invalid_activities = false;

        try {
            let conn = await dbService.conn();

            let batches = [];

            for (let i = 0; i < activities.length; i += batch_process) {
                batches.push(activities.slice(i, i + batch_process));
            }

            for (let batch of batches) {
                let activitiesToUpdate = [];
                let existingActivitiesDict = {};
                let activityIds = [];
                let idTokenMap = {};
                let invalidActivities = {};

                let batchActivityTokens = batch.map((a) => a.activity_token);

                let existingActivities = await conn('activities AS a')
                    .join('persons AS p', 'p.id', '=', 'a.person_id')
                    .whereIn('activity_token', batchActivityTokens)
                    .select('a.*', 'p.person_token');

                for (let activity of existingActivities) {
                    activityIds.push(activity.id);
                    idTokenMap[activity.id] = activity.activity_token;
                    existingActivitiesDict[activity.activity_token] = activity;
                }

                for (let activity of batch) {
                    if (!activity.activity_token) {
                        invalidActivities[activity.activity_token] = true;
                        has_invalid_activities = true;
                        continue;
                    }

                    let existingActivity = existingActivitiesDict[activity.activity_token];

                    if (!existingActivity) {
                        invalidActivities[activity.activity_token] = true;
                        has_invalid_activities = true;
                        continue;
                    }

                    let activityData = {
                        is_fulfilled: activity.is_fulfilled,
                        updated: activity.updated,
                    };

                    if (activity.updated > existingActivity.updated || debug_sync_enabled) {
                        activityData.id = existingActivity.id;
                        activitiesToUpdate.push(activityData);
                    }
                }

                if (Object.keys(invalidActivities).length) {
                    console.warn({
                        invalid_activities_count: Object.keys(invalidActivities).length,
                    });
                }

                if (activitiesToUpdate.length) {
                    try {
                        await batchUpdate('activities', activitiesToUpdate);
                    } catch (e) {
                        console.error(e);
                    }

                    //create activity->persons lookup
                    let notificationsPersons = {};

                    try {
                        //get data
                        let notifications = await conn('activities_notifications AS an')
                            .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                            .where('person_to_network_id', network_self.id)
                            .whereIn('activity_id', activityIds)
                            .select('an.activity_id', 'an.person_to_id', 'p.person_token');

                        for (let an of notifications) {
                            if (!notificationsPersons[an.activity_id]) {
                                notificationsPersons[an.activity_id] = [];
                            }

                            notificationsPersons[an.activity_id].push(an.person_token);
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    //update activity
                    try {
                        let pipeline = cacheService.startPipeline();

                        for (let activity of activitiesToUpdate) {
                            let activity_token = idTokenMap[activity.id];
                            let data = existingActivitiesDict[activity_token];

                            pipeline.hGet(
                                cacheService.keys.activities(data.person_token),
                                activity_token,
                            );
                        }

                        let results = await cacheService.execPipeline(pipeline);

                        let idx = 0;

                        pipeline = cacheService.startPipeline();

                        for (let activity of activitiesToUpdate) {
                            let activity_token = idTokenMap[activity.id];
                            let data = existingActivitiesDict[activity_token];

                            let activityData = JSON.parse(results[idx++]);
                            activityData.is_fulfilled = activity.is_fulfilled;

                            pipeline.hSet(
                                cacheService.keys.activities(data.person_token),
                                activity_token,
                                JSON.stringify(activityData),
                            );
                        }

                        await cacheService.execPipeline(pipeline);
                    } catch (e) {
                        console.error(e);
                    }

                    //update activity->person
                    try {
                        let pipeline = cacheService.startPipeline();

                        for (let activity of activitiesToUpdate) {
                            let activity_token = idTokenMap[activity.id];
                            let persons = notificationsPersons[activity.id];

                            for (let person_token of persons) {
                                pipeline.hGet(
                                    cacheService.keys.persons_activities(person_token),
                                    activity_token,
                                );
                            }
                        }

                        let results = await cacheService.execPipeline(pipeline);

                        let idx = 0;

                        pipeline = cacheService.startPipeline();

                        for (let activity of activitiesToUpdate) {
                            let activity_token = idTokenMap[activity.id];
                            let persons = notificationsPersons[activity.id];

                            for (let person_token of persons) {
                                let activityData = JSON.parse(results[idx++]);

                                if (activityData) {
                                    activityData.is_fulfilled = activity.is_fulfilled;
                                    pipeline.hSet(
                                        cacheService.keys.persons_activities(person_token),
                                        activity_token,
                                        JSON.stringify(activityData),
                                    );

                                    //send ws
                                    try {
                                        cacheService.publishWS('activities', person_token, {
                                            activity_token: activity_token,
                                            is_fulfilled: activity.is_fulfilled,
                                        });
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }
                            }
                        }

                        await cacheService.execPipeline(pipeline);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        } catch (e) {
            console.error('Error in processActivities:', e);
            return reject(e);
        }

        resolve(true);
    });
}

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();
            await syncActivities();
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main,
};

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
