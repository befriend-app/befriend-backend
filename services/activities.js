const cacheService = require('../services/cache');
const dbService = require('../services/db');
const dayjs = require('dayjs');
const { timeNow, getOptionDateTime } = require('./shared');
const { unix } = require('dayjs');

module.exports = {
    maxPerHour: 2,
    durations: {
        min: 10,
        max: 360,
        options: [
            10, 15, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240, 270, 300,
            330, 360,
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
            now: { id: 'now', name: 'Now', is_now: true, in_mins: 5 },
            schedule: { id: 'schedule', name: 'Schedule', is_schedule: true },
            15: { id: 15, value: '15', unit: 'mins', in_mins: 15 },
            30: { id: 30, value: '30', unit: 'mins', in_mins: 30 },
            45: { id: 45, value: '45', unit: 'mins', in_mins: 45 },
            60: { id: 60, value: '1', unit: 'hr', in_mins: 60 },
            90: { id: 90, value: '1.5', unit: 'hrs', in_mins: 90 },
            120: { id: 120, value: '2', unit: 'hrs', in_mins: 120 },
            180: { id: 180, value: '3', unit: 'hrs', in_mins: 180 },
            240: { id: 240, value: '4', unit: 'hrs', in_mins: 240 },
        },
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
                    }
                } else {
                    let default_activity = await module.exports.getDefaultActivity();

                    try {
                        activity.activity.data = default_activity;
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            //duration
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
                    }
                } else {
                    try {
                        place = await cacheService.getObj(
                            cacheService.keys.place_fsq(activity.place.id),
                        );
                    } catch (e) {
                        console.error(e);
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
                }
            }

            //when
            if (
                !activity.when ||
                !activity.when.id ||
                !(activity.when.id in module.exports.when.options)
            ) {
                errors.push('Invalid activity start time');
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
                    end: date.add(when_option.in_mins, 'minutes').unix(),
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

            //todo: add logic to prevent person from creating activities with overlapping times

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
            resolve();
        });
    },
    notifyMatches: function (person, activity, matches) {
        return new Promise(async (resolve, reject) => {
            resolve();
        });
    },
};
