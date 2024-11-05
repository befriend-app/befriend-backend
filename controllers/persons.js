const cacheService = require('../services/cache');
const dbService = require('../services/db');

const { timeNow, generateToken } = require('../services/shared');

const { getPerson } = require('../services/persons');
const {
    getMeSections,
    addMeSection,
    deleteMeSection,
    addMeSectionItem,
    updateMeSectionItem,
} = require('../services/sections');
const { findMatches, notifyMatches, prepareActivity } = require('../services/activities');

module.exports = {
    getMe: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let person_token = req.query.person_token;

            try {
                let me = await getPerson(person_token);

                let sections = await getMeSections(me, req.query.location);

                res.json({
                    me,
                    sections,
                });

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error getting person', 400);
            }
        });
    },
    addMeSection: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await addMeSection(
                    req.body.person_token,
                    req.body.key,
                    req.body.location,
                );

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    deleteMeSection: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await deleteMeSection(req.body.person_token, req.params.section_key);

                res.json(data, 200);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error deleting section', 400);
            }
        });
    },
    addMeSectionItem: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await addMeSectionItem(
                    req.body.person_token,
                    req.body.section_key,
                    req.body.item_token,
                );

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section item', 400);
            }
        });
    },
    updateMeSectionItem: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await updateMeSectionItem(req.body);

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);

                let msg = e && e.message ? e.message : 'Error adding section item';

                res.json(msg, 400);
            }
        });
    },
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

                activity.activity_token = activity_token;

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
                const { person_token, device_token, platform } = req.body;

                // Validate required fields
                if (!device_token || !platform) {
                    res.status(400).json({ message: 'Device token and platform required' });
                    return resolve();
                }

                // Validate platform
                const normalizedPlatform = platform.toLowerCase();

                if (!['ios', 'android'].includes(normalizedPlatform)) {
                    res.status(400).json({ message: 'Invalid platform' });
                    return resolve();
                }

                // Get person
                const person = await getPerson(person_token);

                if (!person) {
                    res.status(400).json({ message: 'Person token not found' });
                    return resolve();
                }

                const conn = await dbService.conn();
                const timestamp = timeNow();

                // Get existing devices
                const personDevices = await conn('persons_devices').where('person_id', person.id);

                // Handle new device registration
                if (!personDevices.length) {
                    const newDevice = {
                        person_id: person.id,
                        token: device_token,
                        platform: normalizedPlatform,
                        is_current: true,
                        last_updated: timestamp,
                        created: timestamp,
                        updated: timestamp,
                    };

                    const [id] = await conn('persons_devices').insert(newDevice);
                    newDevice.id = id;

                    await cacheService.setCache(cacheService.keys.person_devices(person_token), [
                        newDevice,
                    ]);

                    res.status(201).json({ message: 'Added successfully' });
                    return resolve();
                }

                // Handle existing devices
                const existingDevice = personDevices.find((d) => d.platform === normalizedPlatform);

                if (!existingDevice) {
                    res.status(400).json({
                        message: 'Unexpected state: Platform device not found',
                    });
                    return resolve();
                }

                const needsUpdate =
                    existingDevice.token !== device_token || !existingDevice.is_current;

                if (!needsUpdate) {
                    res.status(200).json({ message: 'No update needed' });
                    return resolve();
                }

                // Update devices
                if (personDevices.length > 1) {
                    // Set all devices to not current
                    await conn('persons_devices').where('person_id', person.id).update({
                        is_current: false,
                        updated: timestamp,
                    });
                }

                // Update the target device
                await conn('persons_devices').where('id', existingDevice.id).update({
                    token: device_token,
                    is_current: true,
                    last_updated: timestamp,
                    updated: timestamp,
                });

                // Update cache
                const updatedDevices = personDevices.map((device) => ({
                    ...device,
                    is_current: device.id === existingDevice.id,
                    token: device.id === existingDevice.id ? device_token : device.token,
                    last_updated: device.id === existingDevice.id ? timestamp : device.last_updated,
                    updated: timestamp,
                }));

                await cacheService.setCache(
                    cacheService.keys.person_devices(person_token),
                    updatedDevices,
                );

                res.status(200).json({ message: 'Devices updated' });
                return resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding device', 400);
            }
        });
    },
};
