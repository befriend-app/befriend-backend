const activitiesService = require('../services/activities');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const matchingService = require('../services/matching');

const { timeNow, generateToken, formatObjectTypes, isNumeric } = require('../services/shared');
const { getPerson } = require('../services/persons');

const { getModes } = require('../services/modes');

function createActivity(req, res) {
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
                await activitiesService.prepareActivity(person, activity);
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
            let activity_token = generateToken(20);

            activity.activity_token = activity_token;

            let conn = await dbService.conn();

            let insert_activity = {
                activity_token: activity_token,
                activity_type_id: activity.activity.data.id,
                mode_id: activity.mode.id,
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
            let cache_key = cacheService.keys.persons_activities(person_token);

            try {
                await cacheService.hSet(cache_key, activity_token, insert_activity);
            } catch (e) {
                console.error(e);
            }

            try {
                matches = await activitiesService.findMatches(person, activity);
            } catch (e) {
                console.error(e);
            }

            if (matches && matches.length) {
                try {
                    await activitiesService.notifyMatches(person, activity, matches);

                    res.json(
                        {
                            activity_token: activity_token,
                        },
                        201
                    );
                } catch (e) {
                    console.error(e);

                    let error_message = e?.message ? e.message : 'Error notifying matches';

                    res.json(
                        {
                            error: error_message,
                        },
                        400
                    );
                }
            } else {
                res.json(
                    {
                        error:
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
}

function getMatches(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let person = await getPerson(req.query.person_token);

            let activity = formatObjectTypes(req.query.activity);

            if(!activity || typeof activity !== 'object') {
                res.json({
                    message: 'Invalid mode',
                }, 400);

                return resolve();
            }

            //validate

            //modes
            let modes = await getModes();
            let mode = modes?.byToken[activity.person.mode];

            if(!mode) {
                res.json({
                    message: 'Invalid mode',
                }, 400);

                return resolve();
            }

            //duration
            if (!activity.duration || !activitiesService.durations.options.includes(activity.duration)) {
                res.json({
                    message: 'Invalid duration',
                }, 400);

                return resolve();
            }

            //place
            if(!activity.place?.id) {
                res.json({
                    message: 'Invalid place',
                }, 400);

                return resolve();
            }

            let when_option = activity.when ? activitiesService.when.options[activity.when.id] : null;

            if(!when_option) {
                res.json({
                    message: 'Invalid when',
                }, 400);

                return resolve();
            }

            activity.when = when_option;

            let matches = await matchingService.getMatches(person, {
                activity: activity,
                send_only: true,
                counts_only: true
            });

            res.json(matches);
        } catch(e) {
            console.error(e);

            res.json({
                message: 'Error getting matches',
            }, 400);
        }

        resolve();
    });
}

module.exports = {
    createActivity,
    getMatches
};