const cacheService = require('../services/cache');
const dbService = require('../services/db');
const notificationService = require('../services/notifications');

const { getOptionDateTime } = require('./shared');
const { getModes } = require('./modes');

module.exports = {
    types: null,
    activityTypesMapping: null,
    maxPerHour: 2,
    durations: {
        min: 10,
        max: 360,
        options: [
            10, 15, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120,
            150, 180, 210, 240, 270, 300, 330, 360,
        ],
    },
    thresholds: {
        startTimeTravelTime: 5, //mins
    },
    travelModes: ['driving', 'walking', 'bicycle'],
    friends: {
        types: ['is_new', 'is_existing', 'is_both'],
        max: 10,
    },
    when: {
        options: {
            now: { id: 'now', name: 'Now', value: 'Now', is_now: true, in_mins: 5 },
            schedule: { id: 'schedule', name: 'Schedule', is_schedule: true },
            15: { id: 15, value: '15', unit: 'mins', in_mins: 15 },
            30: { id: 30, value: '30', unit: 'mins', in_mins: 30 },
            45: { id: 45, value: '45', unit: 'mins', in_mins: 45 },
            60: { id: 60, value: '1', unit: 'hr', in_mins: 60 },
            90: { id: 90, value: '1.5', unit: 'hrs', in_mins: 90 },
            120: { id: 120, value: '2', unit: 'hrs', in_mins: 120 },
            150: { id: 150, value: '2.5', unit: 'hrs', in_mins: 150 },
            180: { id: 180, value: '3', unit: 'hrs', in_mins: 180 },
            210: { id: 210, value: '3.5', unit: 'hrs', in_mins: 210 },
            240: { id: 240, value: '4', unit: 'hrs', in_mins: 240 },
            270: { id: 270, value: '4.5', unit: 'hrs', in_mins: 270 },
            300: { id: 300, value: '5', unit: 'hrs', in_mins: 300 },
            330: { id: 330, value: '5.5', unit: 'hrs', in_mins: 330 },
            360: { id: 360, value: '6', unit: 'hrs', in_mins: 360 },
            390: { id: 390, value: '6.5', unit: 'hrs', in_mins: 390 },
            420: { id: 420, value: '7', unit: 'hrs', in_mins: 420 },
            450: { id: 450, value: '7.5', unit: 'hrs', in_mins: 450 },
            480: { id: 480, value: '8', unit: 'hrs', in_mins: 480 },
        },
    },
    getActivityTypes: function () {
        function createActivityObject(activity) {
            let data = {
                name: activity.activity_name,
                title: activity.activity_title,
                notification: activity.notification_name,
                duration: activity.default_duration_min,
                token: activity.activity_type_token,
                image: activity.activity_image,
                emoji: activity.activity_emoji,
                categories: [],
                sub: {},
            };

            //include bool
            for (let k in activity) {
                if (k.startsWith('is_')) {
                    if (activity[k]) {
                        data[k] = activity[k];
                    }
                }
            }

            return data;
        }

        return new Promise(async (resolve, reject) => {
            if (module.exports.types) {
                return resolve(module.exports.types);
            }

            //use existing data in cache if exists
            let cache_key = cacheService.keys.activity_types;
            let data = await cacheService.getObj(cache_key);

            if (data) {
                module.exports.types = data;
                return resolve(data);
            }

            let conn = await dbService.conn();

            let data_organized = {};

            //organize by activity types
            let parent_activity_types = await conn('activity_types')
                .whereNull('parent_activity_type_id')
                .orderBy('sort_position');

            //level 1
            for (let at of parent_activity_types) {
                data_organized[at.id] = createActivityObject(at);
            }

            //level 2
            for (let parent_id in data_organized) {
                let level_2_qry = await conn('activity_types').where(
                    'parent_activity_type_id',
                    parent_id,
                );

                for (let at of level_2_qry) {
                    data_organized[parent_id].sub[at.id] = createActivityObject(at);
                }
            }

            //level 3
            for (let parent_id in data_organized) {
                let level_2_dict = data_organized[parent_id].sub;

                for (let level_2_id in level_2_dict) {
                    let level_3_qry = await conn('activity_types').where(
                        'parent_activity_type_id',
                        level_2_id,
                    );

                    for (let at of level_3_qry) {
                        data_organized[parent_id].sub[level_2_id].sub[at.id] =
                            createActivityObject(at);
                    }
                }
            }

            await cacheService.setCache(cache_key, data_organized);

            module.exports.types = data_organized;

            return resolve(data_organized);
        });
    },
    getActivityTypesMapping: function () {
        return new Promise(async (resolve, reject) => {
            try {
                if (module.exports.activityTypesMapping) {
                    return resolve(module.exports.activityTypesMapping);
                }

                let activityTypes = await module.exports.getActivityTypes();
                let organized = {};

                for (let id in activityTypes) {
                    let level_1 = activityTypes[id];

                    organized[level_1.token] = id;

                    if (level_1.sub) {
                        for (let id_2 in level_1.sub) {
                            let level_2 = level_1.sub[id_2];

                            organized[level_2.token] = id_2;

                            if (level_2.sub) {
                                for (let id_3 in level_2.sub) {
                                    let level_3 = level_2.sub[id_3];

                                    organized[level_3.token] = id_3;
                                }
                            }
                        }
                    }
                }

                module.exports.activityTypesMapping = organized;
                resolve(organized);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getActivityType: function (activity_type_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.activity_type(activity_type_token);

                let cached_data = await cacheService.getObj(cache_key);

                if (cached_data) {
                    return resolve(cached_data);
                }

                let conn = await dbService.conn();

                let qry = await conn('activity_types')
                    .where('activity_type_token', activity_type_token)
                    .first();

                if (!qry) {
                    return resolve(null);
                }

                await cacheService.setCache(cache_key, qry);

                resolve(qry);
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    },
    prepareActivity: function (person, activity) {
        return new Promise(async (resolve, reject) => {
            //validation
            let errors = [];

            if (!person) {
                return reject('Person required');
            }

            if (!activity) {
                return reject('Activity data required');
            }

            if(!activity.person?.mode) {
                errors.push('Mode required');
            } else {
                try {
                    let modes = await getModes();

                    let mode = modes?.byToken[activity.person.mode];

                    if(!mode) {
                        errors.push('Invalid mode provided');
                    } else {
                        activity.mode = {
                            id: mode.id,
                            token: mode.token,
                            name: mode.name
                        }
                    }
                } catch(e) {
                    console.error(e);
                }
            }

            //activity type/name
            if (!activity.activity) {
                errors.push('Missing activity');
            } else {
                if (activity.activity.token) {
                    try {
                        let activity_type = await cacheService.getObj(
                            cacheService.keys.activity_type(activity.activity.token),
                        );

                        if (!activity_type) {
                            errors.push('Invalid activity type');
                        } else {
                            activity.activity.data = activity_type;
                        }
                    } catch (e) {
                        console.error(e);
                        errors.push('Activity type error');
                    }
                } else {
                    let default_activity = await module.exports.getDefaultActivity();

                    try {
                        activity.activity.data = default_activity;
                    } catch (e) {
                        console.error(e);
                        errors.push('Default activity type error');
                    }
                }
            }

            //duration
            let duration_valid = false;

            if (!activity.duration) {
                errors.push('Duration required');
            } else if (activity.duration < module.exports.durations.min) {
                errors.push(`Minimum duration is ${module.exports.durations.min} min`);
            } else if (activity.duration > module.exports.durations.max) {
                errors.push(
                    `Max duration is ${(module.exports.durations.max / 60).toFixed(0)} hours`,
                );
            } else if (!module.exports.durations.options.includes(activity.duration)) {
                errors.push(`Invalid duration`);
            } else {
                duration_valid = true;
            }

            //place
            if (!activity.place || !activity.place.id) {
                errors.push('Place id required');
            } else {
                let place;

                if (activity.place.is_address) {
                    try {
                        place = await cacheService.getObj(
                            cacheService.keys.address_geo(activity.place.id),
                        );
                    } catch (e) {
                        console.error(e);
                        errors.push('Place address error');
                    }
                } else {
                    try {
                        place = await cacheService.getObj(
                            cacheService.keys.place_fsq(activity.place.id),
                        );
                    } catch (e) {
                        console.error(e);
                        errors.push('Place data error');
                    }
                }

                if (!place) {
                    errors.push('Place not found');
                } else if (!place.location_lat || !place.location_lon) {
                    errors.push('Lat/lon required');
                } else {
                    activity.place.data = place;
                }
            }

            let when_option = activity.when ? module.exports.when.options[activity.when.id] : null;

            //travel/distance
            if (!activity.travel || !activity.travel.token) {
                errors.push('Travel token required');
            } else if (!module.exports.travelModes.includes(activity.travel.mode)) {
                errors.push('Invalid travel mode');
            } else {
                try {
                    let travel = await cacheService.getObj(
                        cacheService.keys.travel_times(activity.travel.token),
                    );

                    if (!travel) {
                        errors.push('Travel data required');
                    } else {
                        activity.travel.data = travel;

                        let travel_time = travel.modes[activity.travel.mode];

                        if (
                            travel_time.total >
                            when_option.in_mins + module.exports.thresholds.startTimeTravelTime
                        ) {
                            errors.push('Update your location or activity time');
                        }
                    }
                } catch (e) {
                    console.error(e);
                    errors.push('Travel data error');
                }
            }

            //when
            if (
                !activity.when ||
                !activity.when.id ||
                !(activity.when.id in module.exports.when.options)
            ) {
                errors.push('Invalid activity start time');
            } else if (!duration_valid) {
                //do nothing
            } else {
                let date;

                if (when_option.is_schedule) {
                    //todo schedule
                } else {
                    date = getOptionDateTime(when_option);
                }

                activity.when.data = {
                    is_now: !!when_option.is_now,
                    is_schedule: !!when_option.is_schedule,
                    in_mins: when_option.in_mins ? when_option.in_mins : null,
                    start: date.unix(),
                    end: date.add(activity.duration, 'minutes').unix(),
                    human: {
                        time: date.tz(activity.travel.data.to.tz).format(`h:mm a`),
                        datetime: date
                            .tz(activity.travel.data.to.tz)
                            .format(`YYYY-MM-DD HH:mm:ssZ`),
                    },
                };
            }

            //friends
            let friend_type_valid = false;

            if (activity.friends && activity.friends.type) {
                let bool_count = 0;

                for (let k in activity.friends.type) {
                    if (activity.friends.type[k]) {
                        bool_count++;
                    }
                }

                if (bool_count === 1) {
                    friend_type_valid = true;
                }
            }

            if (!friend_type_valid) {
                errors.push('Invalid friend type');
            }

            //number_persons
            if (!activity.friends || !activity.friends.qty || activity.friends.qty < 1) {
                errors.push('Friends qty required');
            } else if (activity.friends.qty > module.exports.friends.max) {
                errors.push(`Max friends: ${module.exports.friends.max}`);
            }

            //return validation errors
            if (errors.length) {
                return reject(errors);
            }

            try {
                let conn = await dbService.conn();

                let time = activity.when.data;

                const overlapping = await conn('activities')
                    .where('person_id', person.id)
                    .where('is_cancelled', false)
                    .where(function () {
                        this.where(function () {
                            // New activity starts during an existing activity
                            this.where('activity_start', '<=', time.start).where(
                                'activity_end',
                                '>',
                                time.start,
                            );
                        })
                        .orWhere(function () {
                            // New activity ends during an existing activity
                            this.where('activity_start', '<', time.end).where(
                                'activity_end',
                                '>=',
                                time.end,
                            );
                        })
                        .orWhere(function () {
                            // New activity completely contains an existing activity
                            this.where('activity_start', '>=', time.start).where(
                                'activity_end',
                                '<=',
                                time.end,
                            );
                        });
                    });

                if (overlapping.length) {
                    //todo
                    // return reject(['New activity would overlap with existing activity'])
                }
            } catch (e) {
                console.error(e);
                return reject(['Error validating activity times']);
            }

            return resolve(true);
        });
    },
    getDefaultActivity: function () {
        return new Promise(async (resolve, reject) => {
            let key = cacheService.keys.activity_type_default;

            try {
                let data = await cacheService.getObj(key);

                if (data) {
                    return resolve(data);
                }

                let conn = await dbService.conn();

                let qry = await conn('activity_types').where('is_meet', true).first();

                if (qry) {
                    await cacheService.setCache(key, qry);

                    return resolve(qry);
                }
            } catch (e) {
                console.error(e);
            }

            return reject();
        });
    },
    findMatches: function (person, activity) {
        return new Promise(async (resolve, reject) => {
            //tmp
            try {
                let conn = await dbService.conn();

                let matches = await conn('persons').where('id', '<>', person.id).limit(2);

                resolve(matches);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    notifyMatches: function (person, activity, matches) {
        return new Promise(async (resolve, reject) => {
            //title, body, data
            let title_arr = [];
            let plus_str = '';
            let emoji_str = '';
            let time_str = activity.when.time.formatted;
            let place_str = '';

            if (activity.friends.qty > 1) {
                plus_str = ` (+${activity.friends.qty - 1})`;
            }

            if (activity.place.data.name) {
                place_str = `at ${activity.place.data.name}`;
            }

            if (activity.place.is_address) {
            } else {
                if (activity.activity.data.activity_emoji) {
                    emoji_str = activity.activity.data.activity_emoji + ' ';
                }

                if (activity.activity.name) {
                    title_arr.push(activity.activity.name);
                }

                title_arr.push(`at ${time_str}`);
            }

            let payload = {
                title: `${emoji_str}Invite: ${title_arr.join(' ')}`,
                body: `Join ${person.first_name}${plus_str} ${place_str}`,
                data: {
                    activity_token: activity.activity_token,
                },
            };

            let tokens = {
                ios: [],
            };

            for (let match of matches) {
                try {
                    let personDevices = await cacheService.getObj(
                        cacheService.keys.person_devices(match.person_token),
                    );

                    if (!personDevices || !personDevices.length) {
                        continue;
                    }

                    let currentDevice = personDevices.find((device) => device.is_current);

                    if (currentDevice && currentDevice.platform === 'ios') {
                        tokens.ios.push(currentDevice.token);
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            if (tokens.ios.length) {
                try {
                    await notificationService.ios.sendBatch(tokens.ios, payload, true);
                } catch (e) {
                    console.error(e);
                }
            }

            resolve();
        });
    },
};
