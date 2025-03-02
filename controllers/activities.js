const dbService = require('../services/db');
const activitiesService = require('../services/activities');
const matchingService = require('../services/matching');
const reviewsService = require('../services/reviews');

const { formatObjectTypes, timeNow, getIPAddr } = require('../services/shared');
const { getPerson } = require('../services/persons');

const { getModes } = require('../services/modes');
const { acceptNotification, declineNotification } = require('../services/notifications');

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
            } catch (e) {
                res.json(
                    {
                        error: e,
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

function checkIn(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;
        let location = req.body.location;

        try {
            let result = await activitiesService.checkIn(activity_token, person_token, location);

            res.json(result, 201);
        } catch (e) {
            res.json({ error: e.message }, e.status || 400);
        }

        resolve();
    });
}

function checkInWithAccessToken(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.body.access_token;
        let person_token = req.body.person_token;
        let location = req.body.location;

        if (typeof access_token !== 'string') {
            res.json('Access token required', 401);
            return resolve();
        }

        try {
            let result = await activitiesService.checkIn(
                activity_token,
                person_token,
                location,
                access_token,
            );

            res.json(result, 201);
        } catch (e) {
            res.json({ error: e.message }, e.status || 400);
        }

        resolve();
    });
}

function getActivityRules(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            res.json(activitiesService.rules);
        } catch (e) {
            res.json({ message: e.message }, e.status || 400);
        }

        resolve();
    });
}

function getActivity(req, res) {
    return new Promise(async (resolve, reject) => {
        let person_token = req.query.person_token;
        let activity_token = req.params.activity_token;

        try {
            if (typeof activity_token !== 'string') {
                res.json(
                    {
                        message: 'Activity token required',
                    },
                    400,
                );

                return resolve();
            }

            if (typeof person_token !== 'string') {
                res.json(
                    {
                        message: 'Person token required',
                    },
                    400,
                );

                return resolve();
            }

            let activity = await activitiesService.getActivity(person_token, activity_token);

            res.json(activity);
        } catch (e) {
            res.json(
                {
                    error: e?.message,
                },
                e?.status || 400,
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
            let notification = await activitiesService.getActivityNotification(
                activity_token,
                person_token,
            );

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
        let access_token = req.query.access_token;
        let person_token = req.query.person_token;

        try {
            let result = await activitiesService.getActivityNotificationWithAccessToken(
                activity_token,
                access_token,
                person_token,
                req,
            );

            res.json(result);
        } catch (e) {
            res.json({ message: e.message }, e.status || 400);
        }

        resolve();
    });
}

function getActivityWithAccessToken(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.query.access_token;
        let person_token = req.query.person_token;

        if (typeof access_token !== 'string') {
            res.json(
                {
                    message: 'Access token required',
                },
                401,
            );

            return resolve();
        }

        if (typeof activity_token !== 'string') {
            res.json(
                {
                    message: 'Activity token required',
                },
                400,
            );

            return resolve();
        }

        if (typeof person_token !== 'string') {
            res.json(
                {
                    message: 'Person token required',
                },
                400,
            );

            return resolve();
        }

        try {
            let result = await activitiesService.getActivity(
                person_token,
                activity_token,
                access_token,
            );

            res.json(result);
        } catch (e) {
            res.json({ message: e.message }, e.status || 400);
        }

        resolve();
    });
}

function putCancelActivity(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;

        try {
            if (typeof activity_token !== 'string') {
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
                let result = await activitiesService.cancelActivity(me, activity_token);

                res.json(result, 202);
            } catch (e) {
                res.json(
                    {
                        error: e,
                    },
                    400,
                );
            }
        } catch (e) {
            console.error(e);

            res.json(
                {
                    error: 'Error cancelling activity',
                },
                400,
            );
        }

        resolve();
    });
}

function putNetworkCancelActivity(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.body.access_token;
        let person_token = req.body.person_token;

        let errors = [];

        if (typeof activity_token !== 'string') {
            errors.push('Activity token required');
        }

        if (typeof access_token !== 'string') {
            errors.push('Access token required');
        }

        if (typeof person_token !== 'string') {
            errors.push('Person token required');
        }

        if (errors.length) {
            res.json({ message: errors }, 400);
            return resolve();
        }

        let person;

        //validate access token
        try {
            person = await getPerson(person_token);

            if (!person) {
                return res.json(
                    {
                        error: 'Person not found',
                    },
                    400,
                );
            }

            let conn = await dbService.conn();

            let accessTokenQry = await conn('activities_persons')
                .where('person_id', person.id)
                .where('access_token', access_token)
                .first();

            if (!accessTokenQry) {
                res.json({ error: 'Invalid access token' }, 401);
                return resolve();
            }
        } catch (e) {
            return res.json(
                {
                    error: 'Error cancelling activity',
                },
                400,
            );
        }

        try {
            let result = await activitiesService.cancelActivity(person, activity_token);

            res.json(result, 202);
        } catch (e) {
            res.json(
                {
                    error: e,
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
            if (typeof activity_token !== 'string') {
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

                res.json(result, 202);
            } catch (e) {
                res.json(
                    {
                        error: e,
                    },
                    400,
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

function putNetworkAcceptNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.body.access_token;
        let person_token = req.body.person_token;
        let first_name = req.body.first_name;
        let image_url = req.body.image_url;

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

            //validate access token
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
                let result = await acceptNotification(
                    {
                        id: access_token_qry.person_id,
                        person_token,
                        first_name,
                        image_url,
                    },
                    activity_token,
                );

                res.json(result, 202);
            } catch (e) {
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

                res.json(result, 202);
            } catch (e) {
                res.json(
                    {
                        error: e,
                    },
                    400,
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

function putNetworkDeclineNotification(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let access_token = req.body.access_token;
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
                        updated: timeNow(),
                    });
            }

            try {
                let result = await declineNotification(
                    {
                        person_token,
                    },
                    activity_token,
                );

                res.json(result, 202);
            } catch (e) {
                res.json({ error: e }, 400);
            }
        } catch (e) {
            console.error(e);
            res.json({ error: 'Error declining network notification' }, 400);
        }

        resolve();
    });
}

function putReviews(req, res) {
    return new Promise(async (resolve, reject) => {
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;
        let person_to_token = req.body.person_to_token;
        let no_show = req.body.no_show;
        let review = req.body.review;

        try {
            let result = await reviewsService.setActivityReview(
                activity_token,
                person_token,
                person_to_token,
                no_show,
                review,
            );

            res.json(result, 202);
        } catch (e) {
            res.json(
                {
                    error: e?.message ? e.message : 'Error updating person review',
                },
                e?.status ? e.status : 400,
            );
        }

        resolve();
    });
}

function putNetworkReviewActivity(req, res) {
    return new Promise(async (resolve, reject) => {
        let access_token = req.body.access_token;
        let activity_token = req.params.activity_token;
        let person_token = req.body.person_token;
        let person_to_token = req.body.person_to_token;
        let no_show = req.body.no_show;
        let review = req.body.review;

        if (typeof access_token !== 'string') {
            res.json('Access token required', 401);

            return resolve();
        }

        //validate access token
        try {
            let person = await getPerson(person_token);

            if (!person) {
                return res.json(
                    {
                        error: 'Person not found',
                    },
                    400,
                );
            }

            let conn = await dbService.conn();

            let accessTokenQry = await conn('activities_persons')
                .where('person_id', person.id)
                .where('access_token', access_token)
                .first();

            if (!accessTokenQry) {
                res.json({ error: 'Invalid access token' }, 401);
                return resolve();
            }
        } catch (e) {
            return res.json(
                {
                    error: 'Error updating activity review',
                },
                400,
            );
        }

        try {
            let result = await reviewsService.setActivityReview(
                activity_token,
                person_token,
                person_to_token,
                no_show,
                review,
            );

            res.json(result, 202);
        } catch (e) {
            res.json(
                {
                    error: e?.message ? e.message : 'Error updating person review',
                },
                e?.status ? e.status : 400,
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
    checkIn,
    checkInWithAccessToken,
    getActivityRules,
    putCancelActivity,
    putNetworkCancelActivity,
    getActivityNotification,
    getActivityNotificationWithAccessToken,
    getActivity,
    getActivityWithAccessToken,
    getMatches,
    putAcceptNotification,
    putNetworkAcceptNotification,
    putDeclineNotification,
    putNetworkDeclineNotification,
    putReviews,
    putNetworkReviewActivity,
};
