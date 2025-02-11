const activitiesService = require('../services/activities');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const matchingService = require('../services/matching');

const { formatObjectTypes, timeNow, getIPAddr, getURL } = require('../services/shared');
const { getPerson } = require('../services/persons');

const { getModes, getModeById } = require('../services/modes');
const { personToPersonInterests } = require('../services/matching');
const { getActivityType } = require('../services/activities');
const { getGender } = require('../services/genders');
const { getPlaceFSQ } = require('../services/places');
const { acceptNotification, declineNotification } = require('../services/notifications');
const { getNetworkSelf } = require('../services/network');


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
                let activityData = await activitiesService.createActivity(person, activity);

                res.json(activityData, 201);
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

function getActivityMatching(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.query.person_token;

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
                        message: 'person token not found',
                    },
                    400,
                );

                return resolve();
            }

            //ensure person exists on activity invite
            let notification = await cacheService.hGetItem(
                cacheService.keys.activities_notifications(activity_token),
                person_token
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

function getActivityNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.query.person_token;

        try {
            let notification = await activitiesService.getActivityNotification(activity_token, person_token);

            res.json(notification);
        } catch (e) {
            res.json(
                {
                    error: e?.message,
                },
                400,
            );
        }

        resolve();
    });
}

function getActivityNotificationWithAccessToken(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.params.access_token;
        let person_token = req.query.person_token;

        try {
            let result = await activitiesService.getActivityNotificationWithAccessToken(activity_token, access_token, person_token);

            res.json(result);
        } catch(e) {
            res.json({ message: e.message }, e.status || 400);
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

function putAcceptNetworkNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.params.access_token;
        let person_token = req.body.person_token;

        try {
            let errors = [];

            if (!activity_token) {
                errors.push('Activity token required')
            }

            if (!access_token) {
                errors.push('Access token required')
            }

            if (!person_token) {
                errors.push('Person token required');
            }

            if (errors.length) {
                res.json({ message: errors }, 400);
                return resolve();
            }

            // Validate access token
            let conn = await dbService.conn();

            let access_token_qry = await conn('activities_notifications AS an')
                .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                .where('p.person_token', person_token)
                .where('an.access_token', access_token)
                .select('an.*', 'p.id AS person_id')
                .first();

            if (!access_token_qry) {
                res.json({ message: 'Invalid activity person/access token' }, 401);
                return resolve();
            }

            try {
                let result = await acceptNotification({
                    id: access_token_qry.person_id,
                    person_token
                }, activity_token);

                res.json(result);
            } catch(e) {
                res.json({ error: e }, 400);
            }
        } catch (e) {
            console.error(e);
            res.json({ error: 'Error accepting network notification' }, 400);
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

function putDeclineNetworkNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.params.access_token;
        let person_token = req.body.person_token;

        try {
            let errors = [];

            if (!activity_token) {
                errors.push('Activity token required');
            }

            if (!access_token) {
                errors.push('Access token required');
            }

            if (!person_token) {
                errors.push('Person token required');
            }

            if (errors.length) {
                res.json({ message: errors }, 400);
                return resolve();
            }

            // Validate access token
            let conn = await dbService.conn();

            let access_token_qry = await conn('activities_notifications AS an')
                .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                .where('p.person_token', person_token)
                .where('an.access_token', access_token)
                .select('an.*')
                .first();

            if (!access_token_qry) {
                res.json({ message: 'Invalid activity person/access token' }, 401);
                return resolve();
            }

            // Update access token usage if not previously used
            if (!access_token_qry.access_token_used_at) {
                await conn('activities_notifications')
                    .where('id', access_token_qry.id)
                    .update({
                        access_token_used_at: timeNow(),
                        access_token_ip: getIPAddr(req),
                        updated: timeNow()
                    });
            }

            try {
                let result = await declineNotification({
                    person_token
                }, activity_token);

                res.json(result);
            } catch(e) {
                res.json({ error: e }, 400);
            }

        } catch (e) {
            console.error(e);
            res.json({ error: 'Error declining network notification' }, 400);
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
    getActivityNotificationWithAccessToken,
    getMatches,
    putAcceptNotification,
    putAcceptNetworkNotification,
    putDeclineNotification,
    putDeclineNetworkNotification,
};
