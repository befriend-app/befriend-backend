const cacheService = require('../services/cache');
const dbService = require('../services/db');

const { timeNow, generateToken } = require('../services/shared');

const { getPerson } = require('../services/persons');

const { findMatches, notifyMatches, validateActivityOrThrow } = require('../services/activities');

module.exports = {
    createActivity: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let matches;

            try {
                //person token, activity object

                let person_token = req.body.person_token;
                let activity = req.body.activity;
                let friends = req.body.friends; //todo

                //todo validate activity
                try {
                    await validateActivityOrThrow(person_token, activity);
                } catch (e) {
                    res.json(e, 400);
                    return resolve();
                }

                // unique across systems
                let activity_token = generateToken();
                let cache_key = cacheService.keys.activity(activity_token);

                let conn = await dbService.conn();

                // get person id from person token
                let person_obj = await getPerson(person_token);

                if (!person_obj) {
                    res.json(
                        {
                            message: 'person token not found',
                        },
                        400,
                    );

                    return resolve();
                }

                let person_id = person_obj.id;

                let insert_activity = {
                    activity_token: activity_token,
                    activity_type_id: activity.activity_type_id,
                    person_id: person_id,
                    location_lat: activity.location_lat,
                    location_lon: activity.location_lon,
                    location_name: activity.location_name,
                    activity_start: activity.activity_start,
                    activity_duration_min: activity.activity_duration_min,
                    no_end_time: activity.no_end_time,
                    number_persons: activity.number_persons,
                    is_public: activity.is_public,
                    is_new_friends: activity.is_new_friends,
                    is_existing_friends: activity.is_existing_friends,
                    custom_filters: activity.custom_filters,
                    created: timeNow(),
                    updated: timeNow(),
                };

                let id = await conn('activities').insert();

                id = id[0];

                insert_activity.id = id;

                //save to cache
                try {
                    await cacheService.setCache(cache_key, insert_activity);
                } catch(e) {
                    console.error(e);;
                }

                //todo: algorithm/logic to select persons to send this activity to
                try {
                    matches = await findMatches(person_obj, activity);
                } catch (e) {
                    console.error(e);
                }

                //todo: send notifications to matches
                if (matches && matches.length) {
                    try {
                        await notifyMatches(person_obj, activity, matches);
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
};
