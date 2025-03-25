let { timeNow, isObject, isNumeric, getURL } = require('./shared');

let axios = require('axios');

let cacheService = require('../services/cache');
let dbService = require('../services/db');
let personsService = require('../services/persons');
const { updateGridSets } = require('./filters');
const { getNetworkSelf, homeDomains, getNetworkWithSecretKeyByDomain } = require('./network');
const { getModeById } = require('./modes');

let reviewPeriod = 7 * 24 * 3600;

let debug_enabled = require('../dev/debug').reviews.reviewable;

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

            let personFrom = await personsService.getPerson(person_from_token);

            if (!personFrom) {
                return reject({
                    message: 'Person not found',
                    status: 401,
                });
            }

            let personTo = await personsService.getPerson(person_to_token);

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
                    .where('ap.person_id', personFrom.id)
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

            if (timeNow(true) < activity.activity_end && !debug_enabled) {
                return reject({
                    message: 'Please wait until the activity has ended',
                });
            }

            if (timeNow(true) > reviewDeadline && !debug_enabled) {
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
                .where('person_from_id', personFrom.id)
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
                        person_from_id: personFrom.id,
                        person_to_id: personTo.id,
                        activity_id: activity.activity_id,
                        no_show,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }

                if (Object.keys(organizedExisting.ratings).length) {
                    await conn('activities_persons_reviews')
                        .where('person_from_id', personFrom.id)
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
                    await conn('activities_persons_reviews')
                        .where('id', existingReview.id)
                        .update({
                            rating: review.rating,
                            updated: timeNow(),
                            deleted: null,
                        });
                } else {
                    let reviewData = reviewsLookup.byToken[review.type];

                    await conn('activities_persons_reviews')
                        .insert({
                            person_from_id: personFrom.id,
                            person_to_id: personTo.id,
                            activity_id: activity.activity_id,
                            review_id: reviewData.id,
                            rating: review.rating,
                            created: timeNow(),
                            updated: timeNow(),
                        });
                }
            }

            let networkSelf = await getNetworkSelf();

            let returnData;

            //update rating score directly or send to befriend
            if (networkSelf.is_befriend) {
                if (typeof no_show === 'boolean') {
                    returnData = await updatePersonNoShow(personTo);
                } else {
                    returnData = await updatePersonRatings(personTo);
                }
            } else if(networkSelf.id === activity.network_id) {
                //organize activity before sending
                //activity type token, mode_token, activity person_token,
                if(!activity.activity_type_token) {
                    let activityType = await require('./activities').getActivityType(null, activity.activity_type_id);
                    activity.activity_type_token = activityType.activity_type_token;
                }

                if(!activity.mode_token) {
                    if(activity.mode?.token) {
                        activity.mode_token = activity.mode.token;
                    } else {
                        let mode = await getModeById(activity.mode_id);
                        activity.mode_token = mode.token;
                    }
                }

                if(!activity.person_token) {
                    activity.person_token = personActivity.person_from_token;
                }

                let activity_persons = structuredClone(activity.persons);

                if(!activity_persons) {
                    activity_persons = {};

                    let qry = await conn('activities_persons AS ap')
                        .join('persons AS p', 'ap.person_id', '=', 'p.id')
                        .where('activity_id', activity.activity_id)
                        .select('p.person_token', 'is_creator',
                            'accepted_at', 'arrived_at', 'cancelled_at',
                            'ap.updated'
                        );

                    for(let row of qry) {
                        activity_persons[row.person_token] = {
                            is_creator: row.is_creator,
                            accepted_at: row.accepted_at,
                            arrived_at: row.arrived_at,
                            cancelled_at: row.cancelled_at,
                            updated: row.updated
                        };
                    }

                    activity.persons = activity_persons;
                } else {
                    activity.persons = {};

                    for(let person_token in activity_persons) {
                        let person = activity_persons[person_token];

                        activity.persons[person_token] = {
                            is_creator: person.is_creator || false,
                            accepted_at: person.accepted_at || null,
                            arrived_at: person_token.arrived_at || null,
                            cancelled_at: person.cancelled_at || null,
                            updated: person.updated || null
                        };
                    }
                }

                let domains = await homeDomains();

                for (let domain of domains) {
                    try {
                        let network = await getNetworkWithSecretKeyByDomain(domain);

                        if (!network) {
                            continue;
                        }

                        const axiosInstance = axios.create({
                            timeout: 1000,
                        });

                        let data = {
                            secret_key: network.secret_key,
                            network_token: networkSelf.network_token,
                            activity,
                            person_from_token,
                            person_to_token,
                            review: review || null,
                        };

                        if(typeof no_show === 'boolean') {
                            data.no_show = no_show;
                        }

                        let response = await axiosInstance.put(
                            getURL(domain, `networks/reviews/save`),
                            data
                        );
                        
                        if(response.status === 202) {
                            returnData = response.data;
                            break;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            resolve(returnData);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updatePersonNoShow(person) {
    return new Promise(async (resolve, reject) => {
        //if befriend network, updated directly - otherwise aggregate data synced to 3rd party networks
        let percent = 0;

        try {
            let conn = await dbService.conn();

            let personNoShowsQry = await conn('activities_persons_reviews')
                .where('person_to_id', person.id)
                .where('no_show', true)
                .whereNull('deleted');

            let personActivitiesArrivedQry = await conn('activities_persons')
                .where('person_id', person.id)
                .whereNotNull('arrived_at');

            if (personNoShowsQry.length) {
                if (personNoShowsQry.length >= personActivitiesArrivedQry.length) {
                    percent = 100;
                } else {
                    percent = personNoShowsQry.length / personActivitiesArrivedQry.length;
                }
            }

            await conn('persons')
                .where('id', person.id)
                .update({
                    no_show_percent: percent,
                    updated: timeNow(),
                });

            let reviews = await cacheService.hGetItem(
                cacheService.keys.person(person.person_token),
                'reviews',
            );

            if (!reviews) {
                reviews = {};
            }

            reviews.noShowPercent = percent;

            await cacheService.hSet(
                cacheService.keys.person(person.person_token),
                'reviews',
                reviews,
            );

            resolve(reviews);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updatePersonRatings(person) {
    return new Promise(async (resolve, reject) => {
        //if befriend network, updated directly - otherwise aggregate data synced to 3rd party networks

        let reviewsCount = 0;

        let ratingCategories = ['safety', 'trust', 'timeliness', 'friendliness', 'fun'];
        let aggregated = {};

        for (let category of ratingCategories) {
            aggregated[category] = {
                totalWeight: 0,
                weightedSum: 0,
            };
        }

        try {
            let conn = await dbService.conn();

            let reviewsLookup = await getReviewsLookup();

            let personReviewsQry = await conn('activities_persons_reviews')
                .where('person_to_id', person.id)
                .whereNotNull('rating')
                .whereNull('deleted');

            let reviewers = new Set();
            let activities = {};
            let person_activity_keys = {};

            for (let item of personReviewsQry) {
                //reviews count is by activity x person(s)
                let person_activity_key = `${item.activity_id}_${item.person_from_id}`;

                if (!person_activity_keys[person_activity_key]) {
                    person_activity_keys[person_activity_key] = true;
                    reviewsCount++;
                }

                reviewers.add(item.person_from_id);

                if (!activities[item.activity_id]) {
                    activities[item.activity_id] = {};

                    for (let category of ratingCategories) {
                        activities[item.activity_id][category] = null;
                    }
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

            for (let review of personReviewsQry) {
                let reviewer = reviewersLookup[review.person_from_id];

                if (!reviewer || !review.review_id) {
                    continue;
                }

                let reviewData = reviewsLookup.byId[review.review_id];

                if (!reviewData || !ratingCategories.includes(reviewData.token)) {
                    continue;
                }

                let category = reviewData.token;

                //give review more weight if reviewer has many reviews and is highly rated
                let reviewCountWeight = Math.log10(Math.max(reviewer.reviews_count + 1, 2));

                //person's own rating for this category
                let reviewerRating = reviewer[`rating_${category}`] || 3; // Default to 3 if no rating

                let weight = reviewCountWeight * (reviewerRating / 3);

                aggregated[category].totalWeight += weight;
                aggregated[category].weightedSum += review.rating * weight;
            }

            //calculate averages
            let ratings = {};

            for (let category of ratingCategories) {
                if (aggregated[category].totalWeight > 0) {
                    ratings[`rating_${category}`] = Number(
                        (
                            aggregated[category].weightedSum / aggregated[category].totalWeight
                        ).toFixed(2),
                    );
                } else {
                    ratings[`rating_${category}`] = null;
                }
            }

            await conn('persons')
                .where('id', person.id)
                .update({
                    ...ratings,
                    reviews_count: reviewsCount,
                    updated: timeNow(),
                });

            let cacheRatings = {
                count: reviewsCount,
            };

            for (let key in ratings) {
                let rating = ratings[key];
                let new_key = key.replace('rating_', '');
                cacheRatings[new_key] = rating;
            }

            await cacheService.hSet(
                cacheService.keys.person(person.person_token),
                'reviews',
                cacheRatings,
            );

            await updateGridSets(
                {
                    ...person,
                    reviews: cacheRatings,
                },
                null,
                'reviews',
            );

            resolve(cacheRatings);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function isReviewable(activity) {
    if (debug_enabled) {
        return true;
    }

    let reviewThreshold = timeNow(true) - reviewPeriod;

    return timeNow(true) > activity.activity_end && activity.activity_end > reviewThreshold;
}

function saveFromNetwork(from_network, activity, person_from_token, person_to_token, review, no_show) {
    return new Promise(async (resolve, reject) => {
        let { validateActivity } = require('./activities');

        try {
            //validate
            let errors = [];

            let my_network = await getNetworkSelf();

            if(!my_network.is_befriend) {
                errors.push('Not a Befriend network');
            }

            if(!from_network) {
                errors.push('from_network required');
            }

            if(!person_from_token) {
                errors.push('person_from_token required');
            }

            if(!person_to_token) {
                errors.push('person_to_token required');
            }

            if (typeof no_show !== 'boolean' && !isObject(review)) {
                errors.push('No show or review value required');
            }

            errors = errors.concat(validateActivity(activity, true));

            if(errors.length) {
                return reject({
                    message: errors
                });
            }

            let conn = await dbService.conn();

            //activity: first or create
            let activityQry = await conn('activities')
                .where('activity_token', activity.activity_token)
                .first();

            if(!activityQry) {
                //validate activity
            }

            debugger;
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
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
    saveFromNetwork
};
