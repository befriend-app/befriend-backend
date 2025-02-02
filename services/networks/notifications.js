const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const fsqService = require('../../services/fsq');
const notificationsService = require('../../services/notifications');

const { getNetworkSelf } = require('../../services/network');

const { timeNow } = require('../../services/shared');
const { isNumeric, getURL } = require('../shared');
const { getActivityType } = require('../activities');
const { getModeByToken } = require('../modes');

let debug_enabled = require('../../dev/debug').notifications.networks;


module.exports = {
    sendNotifications: function (from_network, person_from_token, activity, persons) {
        let network_self, personsLookup;

        function iosSend(person_from, activityData, ios) {
            return new Promise(async (resolve, reject) => {
                try {
                    //add access token and url to payload
                    let batch_insert = [];

                    let results = await notificationsService.ios.sendBatch(
                        ios.tokens,
                        true
                    );

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
                            updated: timeNow()
                        };

                        if (is_success) {
                            insert.is_success = true;
                        } else {
                            insert.is_failed = true;
                        }

                        batch_insert.push(insert);
                    }

                    if (batch_insert.length) {
                        await dbService.batchInsert('activities_notifications', batch_insert, true);
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

                if(typeof person_from_token !== 'string') {
                    errors.push('Invalid person token');
                }

                if(!persons || typeof persons !== 'object' || !(Object.keys(persons).length)) {
                    errors.push('Invalid persons');
                }

                if(!activity?.activity_token) {
                    errors.push('Activity token required');
                }

                if(!activity.place?.id) {
                    errors.push('FSQ place id required')
                }

                if(!activity.activity?.token) {
                    errors.push("Activity type token required");
                }

                if(!activity.duration) {
                    errors.push('Activity duration required');
                }

                if(!activity.when?.data?.start || activity.when.data.start < timeNow(true)) {
                    errors.push('Invalid activity start time');
                }

                if(!activity.when?.data?.end || activity.when.data.end < timeNow(true)) {
                    errors.push('Invalid activity end time');
                }

                if(!activity.when?.in_mins) {
                    errors.push('In minutes required');
                }

                if(!activity.when?.data?.human?.time || !activity.when?.data?.human?.datetime) {
                    errors.push('Human time required');
                }

                if(!activity.friends?.type || !isNumeric(activity.friends?.qty)) {
                    errors.push('Friends type and qty required');
                }

                if(!activity.person?.mode) {
                    errors.push('Mode token required');
                }

                if(errors.length) {
                    return reject({
                        message: errors
                    });
                }

                let conn = await dbService.conn();

                //validate persons
                let invalidPersons = {};

                personsLookup = {
                    byId: {},
                    byToken: {}
                };

                network_self = await getNetworkSelf();

                let person_from_qry = await conn('persons')
                    .where('person_token', person_from_token)
                    .first();

                if(!person_from_qry) {
                    return reject({
                        message: 'Person from not found'
                    });
                }

                if(person_from_qry.is_blocked) {
                    return reject({
                        message: 'Person not allowed on this network'
                    });
                }

                person_from_qry.first_name = Object.values(persons)[0].person_from_first_name;

                let existingPersonsQry = await conn('networks_persons AS np')
                    .join('persons AS p', 'p.id', '=', 'np.person_id')
                    .where('network_id', network_self.id)
                    .whereIn('person_token', Object.keys(persons))
                    .where('is_active', true)
                    .select('p.id', 'person_token');

                for(let person of existingPersonsQry) {
                    personsLookup.byToken[person.person_token] = person.id;
                    personsLookup.byId[person.id] = person.person_token;
                }

                for(let person_token in persons) {
                    if(!personsLookup.byToken[person_token]) {
                        invalidPersons[person_token] = true;
                    }
                }

                if(Object.keys(invalidPersons).length) {
                    return reject({
                        message: 'Invalid persons found',
                        invalidPersons
                    });
                }

                let activityData = await conn('activities')
                    .where('activity_token', activity.activity_token)
                    .first();

                let activityType = await getActivityType(activity.activity.token);

                if(!activityType) {
                    return reject({
                        message: 'Activity type not found'
                    });
                }

                if(!activityData) {
                    // Validate and get place details
                    let place_details = await fsqService.getPlaceData(activity.place.id);

                    if (!place_details) {
                        return reject({
                            message: 'Place not found'
                        });
                    }

                    let mode = await getModeByToken(activity.person.mode);

                    if(!mode) {
                        return reject({
                            message: 'Mode not found'
                        });
                    }

                    let location = place_details.location;

                    if(!location) {
                        return reject({
                            message: 'No location'
                        });
                    }

                    activityData = {
                        activity_token: activity.activity_token,
                        network_id: network_self.id,
                        activity_type_id: activityType.id,
                        fsq_place_id: place_details.fsq_id,
                        mode_id: mode.id,
                        person_id: person_from_qry.id,
                        persons_qty: activity.friends.qty,
                        activity_start: activity.when.data.start,
                        activity_end: activity.when.data.end,
                        activity_duration_min: activity.duration,
                        in_min: activity.when.in_mins,
                        human_time: activity.when.data.human.time,
                        human_date: activity.when.data.human.datetime,
                        is_public: true,
                        is_new_friends: activity.friends.type.is_new || false,
                        is_existing_friends: activity.friends.type.is_existing || false,
                        location_lat: place_details.geocodes?.main?.latitude,
                        location_lon: place_details.geocodes?.main?.longitude,
                        location_name: place_details.name,
                        location_address: location.address,
                        location_address_2: location.address_extended || null,
                        location_locality: location.locality,
                        location_region: location.region,
                        location_country: location.country,
                        created: timeNow(),
                        updated: activity.updated
                    };

                    let [activity_id] = await conn('activities').insert(activityData);

                    activityData.id = activity_id;
                }

                activityData.activityType = activityType;

                // Process notifications for each person
                let activities_notifications = [];

                let person_ids = Object.values(personsLookup.byToken);

                let existing_notifications = await conn('activities_notifications')
                    .where('activity_id', activityData.id)
                    .whereIn('person_to_id', person_ids);

                let existingNotificationsLookup = {};

                for(let person of existing_notifications) {
                    let token = personsLookup.byId[person.person_id];

                    existingNotificationsLookup[token] = true;
                }

                if (activities_notifications.length) {
                    await dbService.batchInsert('activities_notifications', activities_notifications);
                }

                let devices = await conn('persons_devices AS pd')
                    .join('persons AS p', 'p.id', '=', 'pd.person_id')
                    .whereIn('p.id', person_ids)
                    .where('pd.is_current', true)
                    .select('pd.*', 'p.person_token');

                if(debug_enabled) {
                    devices = await conn('persons_devices AS pd')
                        .join('persons AS p', 'p.id', '=', 'pd.person_id')
                        .select('pd.*', 'p.person_token')
                        .orderBy('p.id')
                        .limit(1);

                    if(devices.length) {
                        for(let person_token in persons) {
                            persons[person_token].device = {
                                token: devices[0].token,
                                platform: devices[0].platform
                            }
                        }
                    }
                } else {
                    for(let pd of devices) {
                        persons[pd.person_token].device = {
                            token: pd.token,
                            platform: pd.platform
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

                let payload = notificationsService.getPayload(from_network, person_from_qry, null, activityData);

                for(let person_token in persons) {
                    if(existingNotificationsLookup[person_token]) {
                        continue;
                    }

                    let to_person = persons[person_token];

                    let payloadCopy = structuredClone(payload);

                    payloadCopy.data.access = {
                        token: to_person.access_token,
                        domain: getURL(from_network.api_domain)
                    }

                    if (to_person.device.platform === 'ios') {
                        platforms.ios.tokens[to_person.device.token] = payloadCopy;
                        platforms.ios.devices[to_person.device.token] = to_person;
                    } else if (to_person.device.platform === 'android') {
                        platforms.android.tokens[to_person.device.token] = payloadCopy;
                        platforms.android.devices[to_person.device.token] = to_person;
                    }
                }

                if(Object.keys(platforms.ios.tokens).length) {
                    try {
                         await iosSend(person_from_qry, activityData, platforms.ios);
                    } catch(e) {
                        console.error(e);
                    }
                }

                if(Object.keys(platforms.android.tokens).length) {
                    //todo android
                }

                resolve({
                    success: true
                });
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
};