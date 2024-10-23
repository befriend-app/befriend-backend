const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { timeNow } = require('./shared');

module.exports = {
    durations: {
        min: 10,
        max: 360,
        options: [10, 15, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240, 270, 300, 330, 360],
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
    prepareActivity: function (person_token, activity) {
        return new Promise(async (resolve, reject) => {
            //validation

            let errors = [];

            if(!person_token) {
                return reject("Person token required");
            }

            if(!activity) {
                return reject("Activity data required");
            }

            //activity type/name
            if(!(activity.activity)) {
                errors.push("Missing activity");
            } else {
                if(activity.activity.token) {
                    try {
                         let activity_type = await cacheService.getObj(cacheService.keys.activity_type(activity.activity.token));

                         if(!activity_type) {
                             errors.push("Invalid activity type");
                         } else {
                             activity.activity.name = activity_type.notification_name;
                         }
                    } catch(e) {
                        console.error(e);
                    }
                } else {
                    activity.activity.name = 'Meet';
                }
            }

            //duration
            if(!activity.duration) {
                errors.push('Duration required');
            } else if(activity.duration < module.exports.durations.min) {
                errors.push(`Minimum duration is ${module.exports.durations.min} min`);
            } else if(activity.duration > module.exports.durations.max) {
                errors.push(`Max duration is ${(module.exports.durations.max / 60).toFixed(0)} hours`);
            } else if(!(module.exports.durations.options.includes(activity.duration))) {
                errors.push(`Invalid duration`);
            }

            //place
            if(!activity.place || !activity.place.id) {
                errors.push('Place id required');
            } else {
                let place;

                if(activity.place.is_address) {
                    try {
                        place = await cacheService.getObj(cacheService.keys.address_geo(activity.place.id));
                    } catch(e) {
                        console.error(e);
                    }
                } else {
                    try {
                        place = await cacheService.getObj(cacheService.keys.place_fsq(activity.place.id));
                    } catch(e) {
                        console.error(e);
                    }
                }
            }

            //when / distance
            //friends
            //number_persons

            return resolve(true);

            //todo: implement validation logic
            //     activity_type_id: activity.activity_type_id,
            //     person_id: person_id,
            //     location_lat: activity.location_lat,
            //     location_lon: activity.location_lon,
            //     location_name: activity.location_name,
            //     activity_start: activity.activity_start,
            //     activity_duration_min: activity.activity_duration_min,
            //     no_end_time: activity.no_end_time,
            //     number_persons: activity.number_persons,
            //     is_public: activity.is_public,
            //     is_new_friends: activity.is_new_friends,
            //     is_existing_friends: activity.is_existing_friends,
            //     custom_filters: activity.custom_filters,
            //     created: timeNow(),
            //     updated: timeNow()

            //todo: add logic to prevent person from creating activities with overlapping times
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
