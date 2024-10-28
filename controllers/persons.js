const cacheService = require('../services/cache');
const dbService = require('../services/db');

const { timeNow, generateToken } = require('../services/shared');

const { getPerson } = require('../services/persons');

const { findMatches, notifyMatches, prepareActivity } = require('../services/activities');

module.exports = {
    createActivity: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let matches;

            try {
                //person token, activity
                let person_token = req.body.person_token;
                let activity = req.body.activity;

                // get person from token
                let person = await getPerson(person_token);

                if (!person) {
                    res.json(
                        {
                            message: 'person token not found',
                        },
                        400,
                    );

                    return resolve();
                }

                //throws rejection if invalid
                try {
                    await prepareActivity(person, activity);
                } catch (errs) {
                    res.json(
                        {
                            error: errs,
                        },
                        400,
                    );
                    return resolve();
                }

                // unique across systems
                let activity_token = generateToken();

                let conn = await dbService.conn();

                let insert_activity = {
                    activity_token: activity_token,
                    activity_type_id: activity.activity.data.id,
                    person_id: person.id,
                    persons_qty: activity.friends.qty,

                    activity_start: activity.when.data.start,
                    activity_end: activity.when.data.end,
                    activity_duration_min: activity.duration,
                    in_min: activity.when.data.in_mins,
                    human_time: activity.when.data.human.time,
                    human_date: activity.when.data.human.datetime,
                    is_now: activity.when.data.is_now,
                    is_schedule: activity.when.data.is_schedule,

                    is_public: true, // Default unless specified otherwise
                    is_new_friends: !!(
                        activity.friends.type.is_new || activity.friends.type.is_both
                    ),
                    is_existing_friends: !!(
                        activity.friends.type.is_existing || activity.friends.type.is_both
                    ),

                    location_lat: activity.place.data.location_lat,
                    location_lon: activity.place.data.location_lon,
                    location_name: activity.place.data.name,
                    location_address: activity.place.data.location_address,
                    location_address_2: activity.place.data.location_address_2,
                    location_locality: activity.place.data.location_locality,
                    location_region: activity.place.data.location_region,
                    location_country: activity.place.data.location_country,

                    is_cancelled: false,
                    no_end_time: false,
                    custom_filters: !!activity.custom_filters,

                    created: timeNow(),
                    updated: timeNow(),
                };

                let id = await conn('activities').insert(insert_activity);

                id = id[0];

                insert_activity.id = id;

                //save to cache
                let cache_key = cacheService.keys.activity(activity_token);

                try {
                    await cacheService.setCache(cache_key, insert_activity);
                } catch (e) {
                    console.error(e);
                }

                //todo: algorithm/logic to select persons to send this activity to
                try {
                    matches = await findMatches(person, activity);
                } catch (e) {
                    console.error(e);
                }

                //todo: send notifications to matches
                if (matches && matches.length) {
                    try {
                        await notifyMatches(person, activity, matches);
                    } catch (e) {
                        console.error(e);
                        res.json(
                            {
                                message: 'Error notifying matches',
                            },
                            400,
                        );
                    }

                    res.json(
                        {
                            activity_token: activity_token,
                        },
                        201,
                    );
                } else {
                    res.json(
                        {
                            message:
                                'No persons found. Please check your filters or try again later.',
                        },
                        400,
                    );
                }

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    },
    addDevice: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_token = req.body.person_token;
                let device_token = req.body.device_token;
                let platform = req.body.platform;

                if(!device_token || !platform) {
                    res.json("Device token and platform required", 400);
                    return resolve();
                }

                platform = platform.toLowerCase();

                if(!(['ios', 'android'].includes(platform))) {
                    res.json(
                        {
                            message: 'Invalid platform',
                        },
                        400,
                    );

                    return resolve();
                }

                let person = await getPerson(person_token);

                if (!person) {
                    res.json(
                        {
                            message: 'person token not found',
                        },
                        400,
                    );

                    return resolve();
                }

                let conn = await dbService.conn();

                let person_devices = await conn('persons_devices')
                    .where('person_id', person.id);

                if(!person_devices.length) {
                    let data = {
                        person_id: person.id,
                        token: device_token,
                        platform: platform,
                        is_current: true,
                        last_updated: timeNow(),
                        created: timeNow(),
                        updated: timeNow()
                    }

                    let id = await conn('persons_devices')
                        .insert(data);

                    data.id = id[0];

                    await cacheService.setCache(cacheService.keys.person_devices(person_token), [data]);

                    res.json("Added successfully", 201);

                    return resolve();
                } else {
                    let needs_update = false;
                    let this_device = null;

                    for(let device of person_devices) {
                        if(device.platform === platform) {
                            this_device = device;

                            if(device.token !== device_token) {
                                needs_update = true;
                            } else if(!device.is_current) {
                                needs_update = true;
                            }
                        }
                    }

                    let tn = timeNow();

                    if(needs_update) {
                        if(person_devices.length > 1) {
                            for(let device of person_devices) {
                                if(device.platform === platform) {
                                    device.is_current = true;
                                    device.token = device_token;
                                    device.last_updated = tn;
                                    device.updated = tn;
                                } else {
                                    device.is_current = false;
                                    device.updated = tn;
                                }
                            }

                            await cacheService.setCache(cacheService.keys.person_devices(person_token), person_devices);

                            await conn('persons_devices')
                                .where('person_id', person.id)
                                .update({
                                    is_current: false,
                                    updated: tn
                                });

                            await conn('persons_devices')
                                .where('id', this_device.id)
                                .update({
                                    token: device_token,
                                    is_current: true,
                                    updated: tn
                                });
                        } else {
                            this_device.token = device_token;
                            this_device.last_updated = tn;
                            this_device.updated = tn;

                            await cacheService.setCache(cacheService.keys.person_devices(person_token), person_devices);

                            await conn('persons_devices')
                                .where('id', this_device.id)
                                .update({
                                    token: device_token,
                                    is_current: true,
                                    updated: tn
                                });
                        }

                        res.json("Devices updated", 200);
                        return resolve();
                    }

                    res.json("No update needed", 200);
                    return resolve();
                }
            } catch(e) {
                console.error(e);
                res.json("Error adding device", 400);
            }
        });
    }
};
