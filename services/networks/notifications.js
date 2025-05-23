const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const fsqService = require('../../services/fsq');
const notificationsService = require('../../services/notifications');

const { getNetworkSelf } = require('../../services/network');

const { timeNow } = require('../../services/shared');
const { isNumeric, getURL, isObject } = require('../shared');
const { getActivityType, doesActivityOverlap, validateActivity } = require('../activities');
const { getModeByToken } = require('../modes');
const { getPerson } = require('../persons');

module.exports = {
    sendNotifications: function (from_network, person_from_token, activity, persons) {
        let network_self, personsLookup;

        let debug_enabled = require('../../dev/debug').notifications.networks;

        function iosSend(person_from, activityData, ios) {
            return new Promise(async (resolve, reject) => {
                try {
                    //add access token and url to payload
                    let pipeline = cacheService.startPipeline();

                    let batch_insert = [];

                    let results = await notificationsService.ios.sendBatch(ios.tokens, true);

                    //2. add to db/cache
                    for (let result of results) {
                        let is_success = false;
                        let device_token = null;

                        let sent = result.sent?.[0];
                        let failed = result.failed?.[0];

                        if (sent) {
                            device_token = sent.device;

                            if (sent.status === 'success') {
                                is_success = true;
                            }
                        }

                        if (failed) {
                            device_token = failed.device;
                        }

                        if (!device_token) {
                            console.error('No device token found');
                            continue;
                        }

                        let to_person = ios.devices[device_token];
                        let to_person_id = personsLookup.byToken[to_person.person_to_token];

                        let insert = {
                            activity_id: activityData.id,
                            person_from_id: person_from.id,
                            person_to_id: to_person_id,
                            person_from_network_id: from_network.id,
                            person_to_network_id: network_self.id,
                            sent_at: timeNow(),
                            access_token: to_person.access_token,
                            created: timeNow(),
                            updated: timeNow(),
                        };

                        if (is_success) {
                            insert.is_success = true;
                        } else {
                            insert.is_failed = true;
                        }

                        batch_insert.push(insert);

                        let insertCopy = structuredClone(insert);

                        insertCopy.person_from_token = person_from_token;
                        pipeline.hSet(
                            cacheService.keys.persons_notifications(to_person.person_to_token),
                            activity.activity_token,
                            JSON.stringify(insertCopy),
                        );
                    }

                    if (batch_insert.length) {
                        await dbService.batchInsert('activities_notifications', batch_insert, true);

                        await cacheService.execPipeline(pipeline);
                    } else {
                        await cacheService.discardPipeline(pipeline);
                    }

                    resolve();
                } catch (e) {
                    console.error(e);
                    return reject(e);
                }
            });
        }

        return new Promise(async (resolve, reject) => {
            try {
                let errors = [];

                if (typeof person_from_token !== 'string') {
                    errors.push('Invalid person token');
                }

                if (!persons || typeof persons !== 'object' || !Object.keys(persons).length) {
                    errors.push('Invalid persons');
                }

                errors = errors.concat(validateActivity(activity));

                if (errors.length) {
                    return reject({
                        message: errors,
                    });
                }

                let conn = await dbService.conn();

                //validate persons
                let invalidPersons = {};

                personsLookup = {
                    byId: {},
                    byToken: {},
                };

                network_self = await getNetworkSelf();

                let person_from_qry = await conn('persons')
                    .where('person_token', person_from_token)
                    .first();

                if (!person_from_qry) {
                    return reject({
                        message: 'Person from not found',
                    });
                }

                if (person_from_qry.is_blocked) {
                    return reject({
                        message: 'Person not allowed on this network',
                    });
                }

                person_from_qry.first_name = Object.values(persons)[0].person_from_first_name;

                let existingPersonsQry = await conn('networks_persons AS np')
                    .join('persons AS p', 'p.id', '=', 'np.person_id')
                    .where('network_id', network_self.id)
                    .whereIn('person_token', Object.keys(persons))
                    .where('is_active', true)
                    .select('p.id', 'person_token');

                for (let person of existingPersonsQry) {
                    personsLookup.byToken[person.person_token] = person.id;
                    personsLookup.byId[person.id] = person.person_token;
                }

                for (let person_token in persons) {
                    if (!personsLookup.byToken[person_token]) {
                        invalidPersons[person_token] = true;
                    }
                }

                if (Object.keys(invalidPersons).length) {
                    return reject({
                        message: 'Invalid persons found',
                        invalidPersons,
                    });
                }

                let activityData = await conn('activities')
                    .where('network_id', from_network.id)
                    .where('activity_token', activity.activity_token)
                    .first();

                let activityType = await getActivityType(
                    activity.activity?.token || activity.activityType?.activity_type_token,
                );

                if (!activityType) {
                    return reject({
                        message: 'Activity type not found',
                    });
                }

                if (!activityData) {
                    // Validate and get place details
                    let place_details = await fsqService.getPlaceData(activity.place.id);

                    if (!place_details) {
                        return reject({
                            message: 'Place not found',
                        });
                    }

                    let mode = await getModeByToken(activity.person.mode);

                    if (!mode) {
                        return reject({
                            message: 'Mode not found',
                        });
                    }

                    let location = place_details.location;

                    let lat =
                        place_details.geocodes?.main?.latitude ||
                        place_details.location_lat ||
                        location?.location_lat;
                    let lon =
                        place_details.geocodes?.main?.longitude ||
                        place_details.location_lon ||
                        location?.location_lon;

                    let address = place_details.location_address || location?.address;
                    let address_2 =
                        place_details.location_address_2 || location?.address_extended || null;
                    let locality = place_details.location_locality || location?.locality;
                    let region = place_details.location_region || location?.region;
                    let country = place_details.location_country || location?.country;

                    if (!lat || !lon || !address || !locality || !region || !country) {
                        return reject({
                            message: 'Location required',
                        });
                    }

                    activityData = {
                        activity_token: activity.activity_token,
                        network_id: from_network.id,
                        activity_type_id: activityType.id,
                        fsq_place_id: place_details.fsq_id || place_details.fsq_place_id,
                        mode_id: mode.id,
                        person_id: person_from_qry.id,
                        persons_qty: activity.friends.qty,
                        spots_available: activity.spots.available,
                        activity_start: activity.when.data.start,
                        activity_end: activity.when.data.end,
                        activity_duration_min: activity.duration,
                        in_min: activity.when.in_mins,
                        human_time: activity.when.data.human.time,
                        human_date: activity.when.data.human.datetime,
                        is_public: true,
                        is_new_friends: activity.friends.type.is_new || false,
                        is_existing_friends: activity.friends.type.is_existing || false,
                        location_lat: lat,
                        location_lon: lon,
                        location_name: place_details.name,
                        location_address: address,
                        location_address_2: address_2,
                        location_locality: locality,
                        location_region: region,
                        location_country: country,
                        created: timeNow(),
                        updated: activity.updated,
                    };

                    let [activity_id] = await conn('activities').insert(activityData);

                    activityData.id = activity_id;
                    activityData.activity_id = activity_id;

                    activityData.activity_type_token = activity.activity.token;
                    activityData.mode = activity.mode;

                    let activityPersonData = {
                        is_creator: true,
                    };

                    if (activity.mode?.token.includes('partner')) {
                        activityPersonData.partner = activity.mode.partner;
                    } else if (activity.mode?.token.includes('kids')) {
                        activityPersonData.kids = activity.mode.kids;
                    }

                    activityData.persons = {
                        [person_from_token]: activityPersonData,
                    };

                    await cacheService.hSet(
                        cacheService.keys.activities(person_from_token),
                        activity.activity_token,
                        activityData,
                    );
                }

                activityData.activityType = activityType;

                // Process notifications for each person
                let activities_notifications = [];

                let person_ids = Object.values(personsLookup.byToken);

                let existing_notifications = await conn('activities_notifications')
                    .where('activity_id', activityData.id)
                    .whereIn('person_to_id', person_ids);

                let existingNotificationsLookup = {};

                for (let person of existing_notifications) {
                    let token = personsLookup.byId[person.person_id];

                    existingNotificationsLookup[token] = true;
                }

                if (activities_notifications.length) {
                    await dbService.batchInsert(
                        'activities_notifications',
                        activities_notifications,
                    );
                }

                let devices = await conn('persons_devices AS pd')
                    .join('persons AS p', 'p.id', '=', 'pd.person_id')
                    .whereIn('p.id', person_ids)
                    .where('pd.is_current', true)
                    .select('pd.*', 'p.person_token');

                if (!debug_enabled) {
                    for (let pd of devices) {
                        persons[pd.person_token].device = {
                            token: pd.token,
                            platform: pd.platform,
                        };
                    }
                } else {
                    devices = await conn('persons_devices AS pd')
                        .join('persons AS p', 'p.id', '=', 'pd.person_id')
                        .select('pd.*', 'p.person_token')
                        .orderBy('p.id')
                        .limit(3);

                    for (let device of devices) {
                        if (persons[device.person_token]) {
                            persons[device.person_token].device = {
                                token: device.token,
                                platform: device.platform,
                            };
                        }
                    }
                }

                let platforms = {
                    ios: {
                        tokens: {},
                        devices: {},
                    },
                    android: {
                        tokens: {},
                        devices: {},
                    },
                };

                let payload = notificationsService.getPayload(
                    from_network,
                    person_from_qry,
                    activityData,
                );

                for (let person_token in persons) {
                    if (existingNotificationsLookup[person_token]) {
                        continue;
                    }

                    let to_person = persons[person_token];

                    if (!to_person.device) {
                        continue;
                    }

                    let payloadCopy = structuredClone(payload);

                    payloadCopy.data.access = {
                        token: to_person.access_token,
                        domain: getURL(from_network.api_domain),
                    };

                    if (to_person.device.platform === 'ios') {
                        platforms.ios.tokens[to_person.device.token] = payloadCopy;
                        platforms.ios.devices[to_person.device.token] = to_person;
                    } else if (to_person.device.platform === 'android') {
                        platforms.android.tokens[to_person.device.token] = payloadCopy;
                        platforms.android.devices[to_person.device.token] = to_person;
                    }
                }

                if (Object.keys(platforms.ios.tokens).length) {
                    try {
                        await iosSend(person_from_qry, activityData, platforms.ios);
                    } catch (e) {
                        console.error(e);
                    }
                }

                if (Object.keys(platforms.android.tokens).length) {
                    //todo android
                }

                resolve({
                    success: true,
                });
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    onSpotsUpdate: function (
        from_network,
        activity_token,
        spots,
        persons = null,
        activity_cancelled_at = null,
    ) {
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof activity_token !== 'string') {
                    return reject({
                        message: 'Invalid activity token',
                    });
                }

                if (!spots || typeof spots !== 'object' || !isNumeric(spots.available)) {
                    return reject({
                        message: 'Invalid spots',
                    });
                }

                if (persons && !isObject(persons)) {
                    return reject({
                        message: 'Invalid persons object',
                    });
                }

                if (activity_cancelled_at && !isNumeric(activity_cancelled_at)) {
                    return reject({
                        message: 'Invalid cancellation time',
                    });
                }

                let conn = await dbService.conn();

                let activity_check = await conn('activities AS a')
                    .join('persons AS p', 'a.person_id', '=', 'p.id')
                    .where('network_id', from_network.id)
                    .where('activity_token', activity_token)
                    .select('a.*', 'p.person_token AS person_from_token')
                    .first();

                if (!activity_check) {
                    return reject({
                        message: 'Activity not found',
                    });
                }

                let cache_key = cacheService.keys.activities(activity_check.person_from_token);

                let updateData = {
                    spots_available: spots.available,
                    updated: timeNow(),
                };

                if (activity_cancelled_at) {
                    updateData.cancelled_at = activity_cancelled_at;
                }

                await conn('activities').where('id', activity_check.id).update(updateData);

                let cache_activity = await cacheService.hGetItem(cache_key, activity_token);

                if (cache_activity) {
                    cache_activity.spots_available = spots.available;

                    if (activity_cancelled_at) {
                        cache_activity.cancelled_at = activity_cancelled_at;
                    }

                    if (persons) {
                        cache_activity.persons = persons;
                    }

                    await cacheService.hSet(cache_key, activity_token, cache_activity);
                }

                let network_self = await getNetworkSelf();

                let notification_persons = await conn('activities_notifications AS an')
                    .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                    .where('activity_id', activity_check.id)
                    .where('person_to_network_id', network_self.id)
                    .select('an.id', 'person_token', 'declined_at');

                let notificationTokens = {};

                //update notification data via ws
                for (let person of notification_persons) {
                    //do not send if person declined
                    if (person.declined_at) {
                        continue;
                    }

                    notificationTokens[person.person_token] = true;

                    cacheService.publishWS('notifications', person.person_token, {
                        activity_token,
                        spots,
                        activity_cancelled_at,
                    });
                }

                //update activity data via ws
                for (let person_token in cache_activity.persons) {
                    let person = cache_activity.persons[person_token];

                    //do not send if person cancelled
                    if (person.cancelled_at) {
                        continue;
                    }

                    if (person_token in notificationTokens) {
                        let data = {
                            activity_token,
                            spots,
                            activity_cancelled_at,
                        };

                        if (persons) {
                            data.persons = persons;
                        }

                        cacheService.publishWS('activities', person_token, data);
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    acceptNotification: function (
        from_network,
        activity_token,
        person_token,
        access_token,
        accepted_at,
    ) {
        return new Promise(async (resolve, reject) => {
            let debug_enabled = require('../../dev/debug').activities.accept;

            try {
                let errors = [];

                if (!person_token) {
                    errors.push('Person token required');
                }

                if (!activity_token) {
                    errors.push('Activity token required');
                }

                if (errors.length) {
                    return reject({ message: errors });
                }

                let person = await getPerson(person_token);

                if (!person) {
                    return reject({ message: 'Person not found' });
                }

                let conn = await dbService.conn();

                let activity = await conn('activities')
                    .where('activity_token', activity_token)
                    .first();

                if (!activity) {
                    return reject({ message: 'Activity not found' });
                }

                let notification = await conn('activities_notifications AS an')
                    .join('persons AS p', 'p.id', '=', 'an.person_from_id')
                    .where('an.person_from_network_id', from_network.id)
                    .where('an.activity_id', activity.id)
                    .where('an.person_to_id', person.id)
                    .select('an.*', 'p.person_token AS person_from_token')
                    .first();

                if (!notification) {
                    return reject({
                        message: 'Activity does not include person',
                    });
                }

                if (notification.declined_at) {
                    return reject('Activity cannot be accepted');
                }

                if (notification.accepted_at) {
                    return reject('Activity already accepted');
                }

                let person_activity_qry = await conn('activities_persons')
                    .where('activity_id', activity.id)
                    .where('person_id', person.id)
                    .first();

                if (person_activity_qry) {
                    return reject('Activity for person already exists');
                }

                let personActivities = await cacheService.hGetAllObj(
                    cacheService.keys.persons_activities(person_token),
                );

                //prevent accepting if person accepted a different activity during the same time
                let activity_overlaps = await doesActivityOverlap(
                    person_token,
                    {
                        start: activity.activity_start,
                        end: activity.activity_end,
                    },
                    personActivities,
                );

                if (activity_overlaps && !debug_enabled) {
                    return reject('Activity overlaps with existing activity');
                }

                let update_data = {
                    accepted_at: accepted_at,
                    updated: accepted_at,
                };

                let update_result = await conn('activities_notifications AS an')
                    .where('id', notification.id)
                    .update(update_data);

                if (update_result) {
                    let activity_cache_key = cacheService.keys.activities(
                        notification.person_from_token,
                    );
                    let person_activities_cache_key =
                        cacheService.keys.persons_activities(person_token);
                    let person_notification_cache_key =
                        cacheService.keys.persons_notifications(person_token);

                    let notification_data = {
                        ...notification,
                        ...update_data,
                    };

                    let person_activity_insert = {
                        access_token,
                        accepted_at,
                        activity_id: activity.id,
                        person_id: person.id,
                        is_creator: false,
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    await conn('activities_persons').insert(person_activity_insert);

                    person_activity_insert = {
                        ...person_activity_insert,
                        activity_token,
                        person_from_token: notification.person_from_token,
                        activity_start: activity.activity_start,
                        activity_end: activity.activity_end,
                        access: {
                            token: access_token,
                            domain: getURL(from_network.api_domain),
                        },
                    };

                    let activity_data = await cacheService.hGetItem(
                        activity_cache_key,
                        activity_token,
                    );

                    if (!activity_data.persons) {
                        activity_data.persons = {};
                    }

                    activity_data.persons[person_token] = {
                        accepted_at,
                        first_name: person.first_name,
                        image_url: person.image_url,
                    };

                    let pipeline = cacheService.startPipeline();

                    pipeline.hSet(
                        activity_cache_key,
                        activity_token,
                        JSON.stringify(activity_data),
                    );

                    pipeline.hSet(
                        person_activities_cache_key,
                        activity_token,
                        JSON.stringify(person_activity_insert),
                    );

                    pipeline.hSet(
                        person_notification_cache_key,
                        activity_token,
                        JSON.stringify(notification_data),
                    );

                    await cacheService.execPipeline(pipeline);

                    return resolve({
                        first_name: person.first_name,
                        image_url: person.image_url,
                        success: true,
                    });
                }

                return reject({
                    message: 'Activity notification status could not be updated',
                });
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    declineNotification: function (from_network, activity_token, person_token, declined_at) {
        return new Promise(async (resolve, reject) => {
            try {
                let errors = [];

                if (!person_token) {
                    errors.push('Person token required');
                }
                if (!activity_token) {
                    errors.push('Activity token required');
                }

                if (errors.length) {
                    return reject({ message: errors });
                }

                let person = await getPerson(person_token);

                if (!person) {
                    return reject({ message: 'Person not found' });
                }

                let conn = await dbService.conn();

                let activity = await conn('activities')
                    .where('activity_token', activity_token)
                    .first();

                if (!activity) {
                    return reject({ message: 'Activity not found' });
                }

                let notification = await conn('activities_notifications AS an')
                    .join('persons AS p', 'p.id', '=', 'an.person_from_id')
                    .where('an.person_from_network_id', from_network.id)
                    .where('an.activity_id', activity.id)
                    .where('an.person_to_id', person.id)
                    .select('an.*', 'p.person_token AS person_from_token')
                    .first();

                if (!notification) {
                    return reject({
                        message: 'Activity does not include person',
                    });
                }

                if (notification.accepted_at) {
                    return reject({
                        message: 'Activity cannot be declined',
                    });
                }

                if (notification.declined_at) {
                    return reject({
                        message: 'Activity already declined',
                    });
                }

                let update_data = {
                    declined_at: declined_at,
                    updated: declined_at,
                };

                let update_result = await conn('activities_notifications AS an')
                    .where('id', notification.id)
                    .update(update_data);

                if (update_result) {
                    let person_notification_cache_key =
                        cacheService.keys.persons_notifications(person_token);

                    await cacheService.hSet(person_notification_cache_key, activity_token, {
                        ...notification,
                        ...update_data,
                    });

                    return resolve({
                        success: true,
                    });
                }

                return reject({
                    message: 'Activity notification status could not be updated',
                });
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    cancelActivity: function (from_network, activity_token, person_token, cancelled_at) {
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof activity_token !== 'string') {
                    return reject({
                        message: 'Invalid activity token',
                    });
                }

                if (typeof person_token !== 'string') {
                    return reject({
                        message: 'Invalid activity token',
                    });
                }

                if (!isNumeric(cancelled_at)) {
                    return reject({
                        message: 'Invalid cancelled timestamp',
                    });
                }

                let conn = await dbService.conn();

                let activity_check = await conn('activities AS a')
                    .join('persons AS p', 'a.person_id', '=', 'p.id')
                    .where('network_id', from_network.id)
                    .where('activity_token', activity_token)
                    .select('a.*', 'p.person_token AS person_from_token')
                    .first();

                if (!activity_check) {
                    return reject({
                        message: 'Activity not found',
                    });
                }

                let cache_key = cacheService.keys.activities(activity_check.person_from_token);

                let cache_activity = await cacheService.hGetItem(cache_key, activity_token);

                if (!cache_activity || !(person_token in cache_activity.persons)) {
                    return reject({
                        message: 'Person does not exist on activity',
                    });
                }

                cache_activity.persons[person_token].cancelled_at = cancelled_at;

                await cacheService.hSet(cache_key, activity_token, cache_activity);

                let personActivity = await cacheService.hGetItem(
                    cacheService.keys.persons_activities(person_token),
                    activity_token,
                );

                if (!personActivity) {
                    return reject({
                        message: 'Person activity not found',
                    });
                }

                personActivity.cancelled_at = cancelled_at;

                await cacheService.hSet(
                    cacheService.keys.persons_activities(person_token),
                    activity_token,
                    personActivity,
                );

                await conn('activities_persons')
                    .where('activity_id', personActivity.activity_id)
                    .where('person_id', personActivity.person_id)
                    .update({
                        cancelled_at,
                        updated: timeNow(),
                    });

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
};
