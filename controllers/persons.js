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
};
