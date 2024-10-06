const dbService = require("../services/db");

const { timeNow, generateToken } = require("../services/shared");

const { getPersonByToken } = require("../services/persons");

const { findMatches, notifyMatches, validateActivityOrThrow } = require("../services/activities");

module.exports = {
    createActivity: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let matches;

            try {
                //person token, activity object

                let person_token = req.body.person_token;
                let activity = req.body.activity;
                let circles = req.body.circles; //todo

                //todo validate activity
                try {
                    await validateActivityOrThrow(activity, person_token);
                } catch (e) {
                    res.json(e, 400);
                    return resolve();
                }

                // unique across systems
                let activity_token = generateToken();

                let conn = await dbService.conn();

                // get person id from person token
                let person_obj = await getPersonByToken(person_token);

                if (!person_obj) {
                    res.json(
                        {
                            message: "person token not found",
                        },
                        400,
                    );

                    return resolve();
                }

                let person_id = person_obj.id;

                let id = await conn("activities").insert({
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
                });

                id = id[0];

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
                                message: "Error notifying matches",
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
                            message: "No persons found. Please check your filters or try again later.",
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
