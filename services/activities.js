const cacheService = require('../services/cache');
const dbService = require('../services/db');
const matchingService = require('../services/matching');
const notificationService = require('../services/notifications');

const { getOptionDateTime, isNumeric, timeNow } = require('./shared');
const { getModes } = require('./modes');
const { getActivityPlace } = require('./places');
const { getNetworkSelf } = require('./network');
const { hGetAllObj } = require('./cache');
const { batchInsert } = require('./db');

module.exports = {
    types: null,
    activityTypesMapping: null,
    lookup: {},
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
    notifications: {
        groups: {
            group_1: {
                size: 1,
                delay: 0
            },
            group_2: {
                size: 3,
                delay: 5000,
            },
            group_3: {
                size: 5,
                delay: 10000
            },
            group_4: {
                size: 10,
                delay: 15000
            },
            group_5: {
                size: 20,
                delay: 30000
            },
            group_6: {
                size: 40,
                delay: 60000
            }
        }
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
                if(module.exports.lookup[activity_type_token]) {
                    return resolve(module.exports.lookup[activity_type_token]);
                }

                let cache_key = cacheService.keys.activity_type(activity_type_token);

                let cached_data = await cacheService.getObj(cache_key);

                if (cached_data) {
                    module.exports.lookup[activity_type_token] = cached_data;
                    return resolve(cached_data);
                }

                let conn = await dbService.conn();

                let qry = await conn('activity_types')
                    .where('activity_type_token', activity_type_token)
                    .first();

                if (!qry) {
                    return resolve(null);
                }

                module.exports.lookup[activity_type_token] = qry;

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

                try {
                    place = await getActivityPlace(activity);
                } catch (e) {
                    console.error(e);
                    errors.push('Place address error');
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
                            !when_option || travel_time.total >
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
                //do nothing, handled above
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
                        time: date.tz(activity.travel?.data?.to.tz).format(`h:mm a`),
                        datetime: date
                            .tz(activity.travel?.data?.to.tz)
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
            if (!activity.friends || !isNumeric(activity.friends?.qty) ||  activity.friends.qty < 1) {
                errors.push('Friends qty required');
            } else if (activity.friends.qty > module.exports.friends.max) {
                errors.push(`Max friends: ${module.exports.friends.max}`);
            }

            //return validation errors
            if (errors.length) {
                return reject(errors);
            }

            try {
                let time = activity.when.data;

                let overlaps = await module.exports.doesActivityOverlap(person.person_token, time);

                //todo remove
                if (0 && overlaps) {
                    return reject(['Activity time overlaps with current activity'])
                }
            } catch (e) {
                console.error(e);
                return reject(['Error validating activity times']);
            }

            return resolve(true);
        });
    },
    doesActivityOverlap: function(person_token, time) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.persons_activities(person_token);

                let data = await cacheService.hGetAllObj(cache_key);

                if(!data) {
                    return resolve(false);
                }

                let overlaps = false;

                for(let k in data) {
                    let activity = data[k];

                    if(activity.is_cancelled) {
                        continue;
                    }

                    if(activity.activity_start <= time.start && activity.activity_end > time.start) {
                        overlaps = true;
                        break;
                    }

                    if(activity.activity_start < time.end && activity.activity_end >= time.end) {
                        overlaps = true;
                        break;
                    }

                    if(activity.activity_start >= time.start && activity.activity_end <= time.end) {
                        overlaps = true;
                        break;
                    }
                }

                resolve(overlaps);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
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
            try {
                let matches = await matchingService.getMatches(person, {
                    activity,
                    send_only: true
                });

                resolve(matches?.matches?.send || []);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    notifyMatches: function (person, activity, matches) {
        let conn, payload, network;
        let isActivityFulfilled = false;

        let _tmp_person_int = 0;
        let _tmp_device_int = 0;

        async function getTmpPersonToken() {
            let conn = await dbService.conn();

            let persons = await conn('persons')
                .where('id', '>', 1)
                .orderBy('id')
                .limit(3);

            let token = persons[_tmp_person_int].person_token;

            _tmp_person_int++;

            if(_tmp_person_int >= persons.length) {
                _tmp_person_int = 0;
            }

            return token;
        }

        async function getTmpDeviceToken() {
            let conn = await dbService.conn();

            let devices = await conn('persons_devices')
                .where('id', '>', 1)
                .orderBy('person_id')
                .limit(3);

            let token = devices[_tmp_device_int].token;

            _tmp_device_int++;

            if(_tmp_device_int >= devices.length) {
                _tmp_device_int = 0;
            }

            return token;
        }

        function getPayload() {
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
                //
            } else {
                if (activity.activity.data.activity_emoji) {
                    emoji_str = activity.activity.data.activity_emoji + ' ';
                }

                if (activity.activity.name) {
                    title_arr.push(activity.activity.name);
                }

                title_arr.push(`at ${time_str}`);
            }

            return {
                title: `${emoji_str}Invite: ${title_arr.join(' ')}`,
                body: `Join ${person.first_name}${plus_str} ${place_str}`,
                data: {
                    activity_token: activity.activity_token,
                    network_token: network.network_token
                }
            };
        }

        function sendGroupNotifications(group, delay) {
            let cache_key = cacheService.keys.activities_notifications(activity.activity_token);

            setTimeout(async function() {
                let platforms = {
                    ios: {
                        tokens: [],
                        devices: {}
                    },
                    android: {
                        tokens: [],
                        devices: {}
                    }
                }

                //check if activity has already been fulfilled
                if(isActivityFulfilled) {
                    return;
                }

                if(delay > 0) {
                    let cache_data = (await cacheService.hGetAllObj(cache_key)) || {};

                    let persons_accepted = 0;

                    for(let k in cache_data) {
                        let v = cache_data[k];

                        if(v.accepted_at && !v.cancelled_at) {
                            persons_accepted++;
                        }
                    }

                    if(persons_accepted >= activity.friends.qty) {
                        isActivityFulfilled = true;
                        return;
                    }
                }

                //1. send notifications
                for(let to_person of group) {
                    // our network
                    if(to_person.network_id === network.id) {
                        if(to_person.device.platform === 'ios') {
                            platforms.ios.tokens.push(to_person.device.token);

                            platforms.ios.devices[to_person.device.token] = to_person;
                        } else if(to_person.device.platform === 'android') {
                            platforms.android.tokens.push(to_person.device.token);
                        }
                    } else { // 3rd party network

                    }
                }

                if (platforms.ios.tokens.length) {
                    try {
                        let batch_insert = [];
                        let to_persons = [];
                        let pipeline = cacheService.startPipeline();

                        let results = await notificationService.ios.sendBatch(platforms.ios.tokens, payload, true);

                        //2. add to db/cache
                        for(let result of results) {
                            let is_success = false;
                            let device_token = null;

                            let sent = result.sent?.[0];
                            let failed = result.failed?.[0];

                            if(sent) {
                                device_token = sent.device;

                                if(sent.status === 'success') {
                                    is_success = true;
                                }
                            }

                            if(failed) {
                                device_token = failed.device;
                            }

                            if(!device_token) {
                                console.error("No device token found");
                                continue;
                            }

                            let to_person = platforms.ios.devices[device_token];

                            to_persons.push(to_person);

                            let insert = {
                                activity_id: activity.activity_id,
                                person_from_id: person.id,
                                person_to_id: to_person.person_id,
                                person_to_network_id: to_person.network_id,
                                sent_at: timeNow(),
                                created: timeNow(),
                                updated: timeNow()
                            }

                            if(is_success) {
                                insert.is_success = true;
                            } else {
                                insert.is_failed = true;
                            }

                            batch_insert.push(insert);
                        }

                        if(batch_insert.length) {
                            await batchInsert('activities_notifications', batch_insert, true);

                            for(let i = 0; i < batch_insert.length; i++) {
                                let insert = batch_insert[i];
                                let to_person = to_persons[i];

                                insert.person_from_token = person.person_token;

                                pipeline.hSet(
                                    cache_key,
                                    to_person.person_token,
                                    JSON.stringify(insert)
                                );
                            }

                            await cacheService.execPipeline(pipeline);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }, delay);
        }

        function isActivityTypeExcluded(filter) {
            if(!filter?.is_active) {
                return false;
            }

            let filtered_activity = Object.values(filter.items || {})
                .find(item => item.activity_type_id === activity.activity?.data?.id);

            if(!filtered_activity) {
                return false;
            }

            return filtered_activity.is_negative;
        }

        return new Promise(async (resolve, reject) => {
            let prev_notifications_persons = {};
            let excluded_by_activity_type = {};

            try {
                conn = await dbService.conn();

                network = await getNetworkSelf();

                payload = getPayload();
            } catch(e) {
                console.error(e);
                return reject(e);
            }

            //get networks and devices for matches
            let pipeline = cacheService.startPipeline();
            let results = [];
            let idx = 0;

            for (let match of matches) {
                //tmp person token - todo remove
                // match.person_token = await getTmpPersonToken();

                pipeline.hmGet(cacheService.keys.person(match.person_token), ['id', 'network_id', 'devices']);
                pipeline.hGet(cacheService.keys.person_filters(match.person_token), 'activity_types');
            }

            try {
                results = await cacheService.execPipeline(pipeline);
            } catch(e) {
                console.error(e);
            }

            let activity_notification_key = cacheService.keys.activities_notifications(activity.activity_token);

            try {
                 prev_notifications_persons = (await hGetAllObj(activity_notification_key)) || {};
            } catch(e) {
                console.error(e);
            }

            for(let match of matches) {
                try {
                    let person = results[idx++];
                    match.person_id = parseInt(person[0]);
                    match.network_id = parseInt(person[1]);
                    let personDevices = JSON.parse(person[2]);

                    let activities_filter = JSON.parse(results[idx++]);

                    let is_activity_excluded = isActivityTypeExcluded(activities_filter);

                    if(is_activity_excluded) {
                        excluded_by_activity_type[match.person_token] = true;
                    }

                    if (!personDevices?.length) {
                        continue;
                    }

                    let currentDevice = personDevices?.find(device => device.is_current);

                    if (currentDevice) {
                        match.device = {
                            platform: currentDevice.platform,
                            token: currentDevice.token,
                        }
                    }
                } catch(e) {
                    console.error(e);
                }
            }

            //organize into groups
            let filtered_matches = [];

            for(let match of matches) {
                if(
                    match.person_token in prev_notifications_persons ||
                    match.person_token in excluded_by_activity_type) {
                    continue;
                }

                if(match.network_id === network.id) {
                    if(match.device?.platform && match.device.token) {
                        //tmp fixed devices - todo remove
                        match.device.token = await getTmpDeviceToken();

                        filtered_matches.push(match);
                    }
                } else {
                    filtered_matches.push(match);
                }
            }

            //tmp limit - todo remove
            filtered_matches = filtered_matches.splice(0, 3);

            if(!filtered_matches.length) {
                return reject("No persons available to notify")
            }

            let groups_organized = {};
            let group_keys = Object.keys(module.exports.notifications.groups);
            let persons_multiplier = Math.max(activity?.friends?.qty, 1);

            let currentIndex = 0;

            for(let i = 0; i < group_keys.length; i++ ) {
                let group_key = group_keys[i];
                let group_size = module.exports.notifications.groups[group_key].size;
                let total_group_size = group_size * persons_multiplier;

                groups_organized[group_key] = {
                    persons: filtered_matches.slice(currentIndex, currentIndex + total_group_size)
                }

                currentIndex += total_group_size;

                if (currentIndex >= filtered_matches.length) {
                    break;
                }
            }

            for(let group_key in groups_organized) {
                let group_matches = groups_organized[group_key].persons;

                let group_delay = module.exports.notifications.groups[group_key];

                sendGroupNotifications(group_matches, group_delay.delay);
            }

            resolve();
        });
    },
};
