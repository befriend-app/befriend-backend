let dbService = require('../services/db');
const { timeNow, isObject, isNumeric } = require('./shared');
const { getPerson } = require('./persons');
const cacheService = require('./cache');

let reviewPeriod = 7 * 24 * 3600;

function getReviewsLookup() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.data) {
            return resolve(module.exports.data);
        }

        let lookup = {
            byId: {},
            byToken: {},
        };

        try {
            let conn = await dbService.conn();

            let data = await conn('reviews').where('is_active', true).orderBy('sort_position');

            for (let review of data) {
                lookup.byId[review.id] = review;
                lookup.byToken[review.token] = review;
            }

            module.exports.data = lookup;

            return resolve(lookup);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getPersonReviews(person) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let reviewsLookup = await getReviewsLookup();

            let threshold = timeNow() - reviewPeriod * 1000;

            let reviewsQry = await conn('activities_persons_reviews AS apr')
                .join('persons AS p', 'p.id', '=', 'apr.person_to_id')
                .where('person_from_id', person.id)
                .where('apr.created', '>', threshold)
                .select('apr.*', 'p.id AS person_id', 'person_token');

            let activity_ids = new Set();

            for (let item of reviewsQry) {
                activity_ids.add(item.activity_id);
            }

            let activitiesQry = await conn('activities')
                .whereIn('id', Array.from(activity_ids))
                .select('id', 'activity_token');

            let activityIdTokenMap = {};

            for (let activity of activitiesQry) {
                activityIdTokenMap[activity.id] = activity.activity_token;
            }

            let organized = {};

            for (let item of reviewsQry) {
                let activity_token = activityIdTokenMap[item.activity_id];
                let person_token = item.person_token;

                if (!organized[activity_token]) {
                    organized[activity_token] = {};
                }

                if (!organized[activity_token][person_token]) {
                    organized[activity_token][person_token] = {};
                }

                if (!item.review_id) {
                    organized[activity_token][person_token].noShow = item.no_show;
                } else if (item.rating) {
                    let reviewData = reviewsLookup.byId[item.review_id];
                    organized[activity_token][person_token][reviewData.token] = item.rating;
                }
            }

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getActivityReviews(activity_id, person_id) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let reviewsLookup = await getReviewsLookup();

            let reviewsQry = await conn('activities_persons_reviews AS apr')
                .join('persons AS p', 'p.id', '=', 'apr.person_to_id')
                .where('person_from_id', person_id)
                .where('activity_id', activity_id)
                .select('apr.*', 'p.id AS person_id', 'person_token');

            let organized = {};

            for (let item of reviewsQry) {
                let person_token = item.person_token;

                if (!organized[person_token]) {
                    organized[person_token] = {};
                }

                if (!item.review_id) {
                    organized[person_token].noShow = item.no_show;
                } else if (item.rating) {
                    let reviewData = reviewsLookup.byId[item.review_id];
                    organized[person_token][reviewData.token] = item.rating;
                }
            }

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function setActivityReview(activity_token, person_from_token, person_to_token, no_show, review) {
    return new Promise(async (resolve, reject) => {
        try {
            //validate
            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Invalid activity token',
                });
            }

            if (typeof person_from_token !== 'string') {
                return reject({
                    message: 'Invalid person token',
                });
            }

            if (typeof person_to_token !== 'string') {
                return reject({
                    message: 'Invalid person token',
                });
            }

            if (typeof no_show !== 'boolean' && !isObject(review)) {
                return reject({
                    message: 'No show or review value required',
                });
            }

            if (review) {
                if (!isObject(review) || typeof review.type !== 'string') {
                    return reject({
                        message: 'Invalid review format',
                    });
                }

                if (!isNumeric(review.rating) && review.rating !== null) {
                    return reject({
                        message: 'Invalid rating value',
                    });
                }

                if (isNumeric(review.rating)) {
                    if (review.rating > 5 || review.rating < 1) {
                        return reject({
                            message: 'Review must be in the range of 1-5',
                        });
                    }
                }
            }

            let reviewsLookup = await getReviewsLookup();

            if (typeof no_show === 'undefined' && !reviewsLookup.byToken[review.type]) {
                return reject({
                    message: 'Invalid review type',
                });
            }

            let person = await getPerson(person_from_token);

            if (!person) {
                return reject({
                    message: 'Person not found',
                    status: 401,
                });
            }

            let personTo = await getPerson(person_to_token);

            if (!personTo) {
                return reject({
                    message: 'Person for review not found',
                });
            }

            let conn = await dbService.conn();

            //get person activity with from token from cache, use db backup if not in cache
            let personActivity = await cacheService.hGetItem(
                cacheService.keys.persons_activities(person_from_token),
                activity_token,
            );

            if (!personActivity) {
                personActivity = await conn('activities_persons AS ap')
                    .join('activities AS a', 'a.id', '=', 'ap.activity_id')
                    .where('activity_token', activity_token)
                    .where('ap.person_id', person.id)
                    .select('ap.*', 'a.person_id AS person_id_from')
                    .first();

                if (!personActivity) {
                    return reject({
                        message: 'Person not found on activity',
                    });
                }

                let personFromQry = await conn('persons AS p')
                    .where('p.id', personActivity.person_id_from)
                    .select('p.*')
                    .first();

                if (!personFromQry) {
                    return reject({
                        message: 'Activity creator not found',
                        status: 400,
                    });
                }

                personActivity.person_from_token = personFromQry.person_token;
            }

            //get activity data from cache, use db as backup
            let activity = await cacheService.hGetItem(
                cacheService.keys.activities(personActivity.person_from_token),
                activity_token,
            );

            if (!activity) {
                activity = await conn('activities_persons AS ap')
                    .join('activities AS a', 'a.id', '=', 'ap.activity_id')
                    .where('activity_token', activity_token)
                    .where('ap.person_id', personTo.id)
                    .select('*')
                    .first();

                if (!activity) {
                    return reject({
                        message: 'Person not found on activity',
                    });
                }

                activity.persons = {
                    [person_to_token]: {
                        cancelled_at: activity.cancelled_at,
                    },
                };
            }

            //wait until end of activity and allow reviewing for up to a week
            let reviewDeadline = activity.activity_end + 7 * 24 * 60 * 60;

            if (timeNow(true) < activity.activity_end) {
                return reject({
                    message: 'Please wait until the activity has ended',
                });
            }

            if (timeNow(true) > reviewDeadline) {
                return reject({
                    message: 'The review period for this activity has expired',
                });
            }

            if (!activity.persons[person_to_token]) {
                return reject({
                    message: 'Person for review not found on activity',
                });
            }

            if (
                activity.persons[person_from_token].cancelled_at ||
                activity.persons[person_to_token].cancelled_at
            ) {
                return reject({
                    message: `Activity participation cancelled`,
                });
            }

            //get existing reviews data for this activity-person
            let existingReviewsQry = await conn('activities_persons_reviews')
                .where('person_from_id', person.id)
                .where('person_to_id', personTo.id)
                .where('activity_id', activity.activity_id);

            let organizedExisting = {
                no_show: null,
                ratings: {},
            };

            for (let item of existingReviewsQry) {
                if (item.no_show !== null) {
                    organizedExisting.no_show = {
                        id: item.id,
                        value: item.no_show,
                    };
                } else {
                    let reviewData = reviewsLookup.byId[item.review_id];

                    organizedExisting.ratings[reviewData.token] = item;
                }
            }

            //no show/review logic
            if (typeof no_show === 'boolean') {
                if (organizedExisting.no_show && organizedExisting.no_show.value !== null) {
                    //update existing db records
                    //set all previous reviews to null/deleted
                    await conn('activities_persons_reviews')
                        .where('id', organizedExisting.no_show.id)
                        .update({
                            no_show,
                            updated: timeNow(),
                        });
                } else {
                    //create new record
                    await conn('activities_persons_reviews').insert({
                        person_from_id: person.id,
                        person_to_id: personTo.id,
                        activity_id: activity.activity_id,
                        no_show,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }

                if (Object.keys(organizedExisting.ratings).length) {
                    await conn('activities_persons_reviews')
                        .where('person_from_id', person.id)
                        .where('person_to_id', personTo.id)
                        .where('activity_id', activity.activity_id)
                        .whereNotNull('review_id')
                        .update({
                            rating: null,
                            updated: timeNow(),
                            deleted: no_show ? timeNow() : null,
                        });
                }
            } else {
                //return error if trying to set a review rating with no show set as true
                if (organizedExisting.no_show?.value) {
                    return reject({
                        message: 'Unable to set review for no show participant',
                    });
                }

                //update or create new
                let existingReview = organizedExisting.ratings[review.type];

                if (existingReview) {
                    await conn('activities_persons_reviews').where('id', existingReview.id).update({
                        rating: review.rating,
                        updated: timeNow(),
                        deleted: null,
                    });
                } else {
                    let reviewData = reviewsLookup.byToken[review.type];

                    await conn('activities_persons_reviews').insert({
                        person_from_id: person.id,
                        person_to_id: personTo.id,
                        activity_id: activity.activity_id,
                        review_id: reviewData.id,
                        rating: review.rating,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }
            }

            await updatePersonRatings(personTo.id);

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updatePersonRatings(person_id) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let reviewsLookup = await getReviewsLookup();

            let personReviewsQry = await conn('activities_persons_reviews')
                .where('person_to_id', person_id)
                .whereNotNull('rating')
                .whereNull('deleted');

            let reviewers = new Set();
            let activities = {};

            for (let item of personReviewsQry) {
                reviewers.add(item.person_from_id);

                if (!activities[item.activity_id]) {
                    activities[item.activity_id] = {
                        safety: null,
                        trust: null,
                        timeliness: null,
                        friendliness: null,
                        fun: null,
                    };
                }

                let reviewData = reviewsLookup.byId[item.review_id];
                activities[item.activity_id][reviewData.token] = item.rating;
            }

            let reviewersQry = await conn('persons')
                .whereIn('id', Array.from(reviewers))
                .select(
                    'id',
                    'person_token',
                    'reviews_count',
                    'rating_safety',
                    'rating_trust',
                    'rating_timeliness',
                    'rating_friendliness',
                    'rating_fun',
                );

            let reviewersLookup = {};

            for (let reviewer of reviewersQry) {
                reviewersLookup[reviewer.id] = reviewer;
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function isReviewable(activity) {
    let reviewThreshold = timeNow(true) - reviewPeriod;

    return timeNow(true) > activity.activity_end && activity.activity_end > reviewThreshold;
}

module.exports = {
    filters: {
        default: 4.5,
    },
    data: null,
    reviewPeriod,
    getReviewsLookup,
    getPersonReviews,
    getActivityReviews,
    setActivityReview,
    updatePersonRatings,
    isReviewable,
};
