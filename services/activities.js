const cacheService = require('../services/cache');
const dbService = require('../services/db');
const {timeNow} = require("./shared");

module.exports = {
    getActivityType: function (activity_type_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.activity_type + activity_type_token;

                 let cached_data = await cacheService.get(cache_key,true);

                 if(cached_data) {
                     return resolve(cached_data);
                 }

                 let conn = await dbService.conn();

                 let qry = await conn('activity_types')
                     .where('activity_type_token', activity_type_token)
                     .first();

                 if(!qry) {
                     return resolve(null);
                 }

                 await cacheService.setCache(cache_key, qry);

                 resolve(qry);
            } catch(e) {
                console.error(e);
                reject(e);
            }
        });
    },
    validateActivityOrThrow: function (person, activity) {
        return new Promise(async (resolve, reject) => {
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
    }
};