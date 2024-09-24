const {timeNow} = require("./shared");

module.exports = {
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