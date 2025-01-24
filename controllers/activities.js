const activitiesService = require('../services/activities');
const cacheService = require('../services/cache');
const matchingService = require('../services/matching');

const { formatObjectTypes } = require('../services/shared');
const { getPerson } = require('../services/persons');

const { getModes, getModeById } = require('../services/modes');
const { personToPersonInterests } = require('../services/matching');
const { getActivityType, declineNotification, acceptNotification } = require('../services/activities');
const { getGender } = require('../services/genders');
const { getPlaceFSQ } = require('../services/places');


function createActivity(req, res) {
    return new Promise(async (resolve, reject) => {
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

            try {
                let activity_token = await activitiesService.createActivity(person, activity);

                res.json(
                    {
                        activity_token: activity_token,
                    },
                    201
                );
            } catch(e) {
                res.json(
                    {
                        error: e,
                    },
                    400
                );
            }

            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function getActivityNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.query.person_token;
        let network_token = req.query.network_token;

        try {
            if (!activity_token || !network_token) {
                res.json(
                    {
                        message: 'Activity and network token required',
                    },
                    400,
                );

                return resolve();
            }

            let me = await getPerson(person_token);

            if (!me) {
                res.json(
                    {
                        message: 'person token not found',
                    },
                    400,
                );

                return resolve();
            }

            //validate network token

            //ensure person exists on activity invite
            let notification = await cacheService.hGetItem(
                cacheService.keys.activities_notifications(activity_token),
                person_token,
            );

            if (!notification) {
                res.json(
                    {
                        message: 'Activity does not include person',
                    },
                    400,
                );

                return resolve();
            }

            let cache_key = cacheService.keys.activities(notification.person_from_token);

            let activity = await cacheService.hGetItem(cache_key, activity_token);

            if (!activity) {
                res.json(
                    {
                        error: 'Activity not found',
                    },
                    400,
                );

                return resolve();
            }

            activity.place = await getPlaceFSQ(activity.fsq_place_id);
            activity.activity_type = await getActivityType(activity.activity_type_token);
            activity.mode = await getModeById(activity.mode_id);

            let person_from = await getPerson(notification.person_from_token);
            let gender = await getGender(person_from.gender_id);

            let matching = await personToPersonInterests(me, person_from);

            res.json({
                notification,
                activity,
                matching,
                person: {
                    gender,
                    is_new: person_from.is_new,
                    first_name: person_from.first_name,
                    image_url: person_from.image_url,
                    age: person_from.age,
                    reviews: person_from.reviews,
                },
            });
        } catch (e) {
            console.error(e);

            res.json(
                {
                    error: 'Error getting activity',
                },
                400,
            );
        }

        resolve();
    });
}

function putAcceptNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;

        try {
            if (!activity_token) {
                res.json(
                    {
                        message: 'Activity token required',
                    },
                    400,
                );

                return resolve();
            }

            let me = await getPerson(person_token);

            if (!me) {
                res.json(
                    {
                        message: 'Person token not found',
                    },
                    400,
                );

                return resolve();
            }

            try {
                let result = await acceptNotification(me, activity_token);

                res.json(result);
            } catch(e) {
                res.json(
                    {
                        error: e
                    },
                    400
                );
            }
        } catch (e) {
            console.error(e);

            res.json(
                {
                    error: 'Error getting activity',
                },
                400,
            );
        }

        resolve();
    });
}

function putDeclineNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;

        try {
            if (!activity_token) {
                res.json(
                    {
                        message: 'Activity token required',
                    },
                    400,
                );

                return resolve();
            }

            let me = await getPerson(person_token);

            if (!me) {
                res.json(
                    {
                        message: 'Person token not found',
                    },
                    400,
                );

                return resolve();
            }

            try {
                let result = await declineNotification(me, activity_token);

                res.json(result);
            } catch(e) {
                res.json(
                    {
                        error: e
                    },
                    400
                );
            }
        } catch (e) {
            console.error(e);

            res.json(
                {
                    error: 'Error getting activity',
                },
                400,
            );
        }

        resolve();
    });
}

function getMatches(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let person = await getPerson(req.query.person_token);

            let activity = formatObjectTypes(req.query.activity);

            if (!activity || typeof activity !== 'object') {
                res.json(
                    {
                        message: 'Invalid mode',
                    },
                    400,
                );

                return resolve();
            }

            //validate

            //modes
            let modes = await getModes();
            let mode = modes?.byToken[activity.person?.mode];

            if (!mode) {
                res.json(
                    {
                        message: 'Invalid mode',
                    },
                    400,
                );

                return resolve();
            }

            //duration
            if (
                !activity.duration ||
                !activitiesService.durations.options.includes(activity.duration)
            ) {
                res.json(
                    {
                        message: 'Invalid duration',
                    },
                    400,
                );

                return resolve();
            }

            //place
            if (!activity.place?.id) {
                res.json(
                    {
                        message: 'Invalid place',
                    },
                    400,
                );

                return resolve();
            }

            let when_option = activity.when
                ? activitiesService.when.options[activity.when.id]
                : null;

            if (!when_option) {
                res.json(
                    {
                        message: 'Invalid when',
                    },
                    400,
                );

                return resolve();
            }

            activity.when = when_option;

            let matches = await matchingService.getMatches(person, {
                activity: activity,
                send_only: true,
                counts_only: true,
            });

            res.json(matches);
        } catch (e) {
            console.error(e);

            res.json(
                {
                    message: 'Error getting matches',
                },
                400,
            );
        }

        resolve();
    });
}

module.exports = {
    createActivity,
    getActivityNotification,
    getMatches,
    putAcceptNotification,
    putDeclineNotification,
};
