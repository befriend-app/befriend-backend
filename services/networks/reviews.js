const { getNetworkSelf } = require('../network');
const { isObject, timeNow } = require('../shared');
const { friends, validateActivity, getActivityType } = require('../activities');
const dbService = require('../db');
const { getModeByToken } = require('../modes');
const { getGridById } = require('../grid');
const { getReviewsLookup, updatePersonRatings, updatePersonNoShow } = require('../reviews');

let debug_enabled = require('../../dev/debug').sync.reviews;


function saveFromNetwork(from_network, activity, person_from_token, person_to_token, review, no_show) {
    return new Promise(async (resolve, reject) => {
        try {
            //initial validation
            let errors = [];

            let networkSelf = await getNetworkSelf();

            if(!networkSelf.is_befriend) {
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

            let personTokens = Object.keys(activity?.persons || {});

            if(!personTokens.length) {
                errors.push('Activity persons required');
            }

            if(personTokens.length > friends.max * 2) {
                errors.push('Too many person tokens provided');
            }

            //activity validation
            errors = errors.concat(validateActivity(activity, true));

            if(errors.length) {
                return reject({
                    message: errors
                });
            }

            //persons validation
            let conn = await dbService.conn();

            //create persons lookup
            let persons = await conn('persons')
                .whereIn('person_token', personTokens)
                .select('id', 'person_token', 'grid_id');

            let personsLookup = {
                byId: {},
                byToken: {}
            };

            for(let person of persons) {
                if(person.person_token in personsLookup.byToken) {
                    continue;
                }

                personsLookup.byId[person.id] = person;
                personsLookup.byToken[person.person_token] = person;
            }

            //ensure persons exist in our db
            for(let person_token of personTokens) {
                if(!personsLookup.byToken[person_token]) {
                    errors.push(`Person ${person_token}: not found`);
                }
            }

            if(!personsLookup.byToken[activity.person_token]) {
                errors.push('Activity creator not known')
            }

            //ensure from person and to person exist in lookup
            if(!personsLookup.byToken[person_from_token]) {
                errors.push(`Person from ${person_from_token}: not found`);
            }

            if(!personsLookup.byToken[person_to_token]) {
                errors.push(`Person to ${person_to_token}: not found`);
            }

            if(errors.length) {
                return reject({
                    message: errors
                });
            }

            //activity: first or create
            let activityQry = await conn('activities')
                .where('activity_token', activity.activity_token)
                .first();

            let activity_id = activityQry?.id;

            if(!activityQry) {
                let activityType = await getActivityType(activity.activity_type_token);
                let mode = await getModeByToken(activity.mode_token);

                let activityInsert = {
                    activity_token: activity.activity_token,
                    network_id: from_network.id,
                    activity_type_id: activityType.id,
                    fsq_place_id: activity.fsq_place_id,
                    mode_id: mode.id,
                    person_id: personsLookup.byToken[activity.person_token].id,
                    persons_qty: activity.persons_qty,
                    spots_available: activity.spots_available,
                    activity_start: activity.activity_start,
                    activity_end: activity.activity_end,
                    activity_duration_min: activity.activity_duration_min,
                    in_min: activity.in_min,
                    human_time: activity.human_time,
                    human_date: activity.human_date,
                    is_public: activity.is_public,
                    is_new_friends: activity.is_new_friends || false,
                    is_existing_friends: activity.is_existing_friends || false,
                    location_lat: activity.location_lat,
                    location_lon: activity.location_lon,
                    location_name: activity.location_name,
                    location_address: activity.location_address,
                    location_address_2: activity.location_address_2,
                    location_locality: activity.location_locality,
                    location_region: activity.location_region,
                    location_country: activity.location_country,
                    created: timeNow(),
                    updated: activity.updated || timeNow(),
                };

                [activity_id] = await conn('activities')
                    .insert(activityInsert);
            }

            activity.activity_id = activity_id;

            //get/add activity->persons
            let existingPersonsQry = await conn('activities_persons')
                .where('activity_id', activity_id);

            let existingPersonsOrganized = {};

            for(let person of existingPersonsQry) {
                let person_token = personsLookup.byId[person.person_id].person_token;
                existingPersonsOrganized[person_token] = person;
            }

            let personsInsert = [];
            let personsUpdate = [];

            for(let person_token in activity.persons) {
                let activityPerson = activity.persons[person_token];
                let person_id = personsLookup.byToken[person_token].id;
                let existingRecord = existingPersonsOrganized[person_token];

                if(!existingRecord) {
                    personsInsert.push({
                        activity_id,
                        person_id,
                        is_creator: activityPerson.is_creator || false,
                        accepted_at: activityPerson.accepted_at || null,
                        arrived_at: activityPerson.arrived_at || null,
                        cancelled_at: activityPerson.cancelled_at || null,
                        left_at: activityPerson.left_at || null,
                        created: timeNow(),
                        updated: activityPerson.updated || timeNow()
                    });
                } else {
                    let hasChanged = false;
                    let fields = ['accepted_at', 'arrived_at', 'cancelled_at', 'left_at'];

                    for(let field of fields) {
                        if(field in activityPerson && activityPerson[field] !== existingRecord[field]) {
                            hasChanged = true;
                        }
                    }

                    if(hasChanged) {
                        let activity_person_id = existingRecord.id;

                        personsUpdate.push({
                            id: activity_person_id,
                            accepted_at: activityPerson.accepted_at || null,
                            arrived_at: activityPerson.arrived_at || null,
                            cancelled_at: activityPerson.cancelled_at || null,
                            left_at: activityPerson.left_at || null,
                            created: timeNow(),
                            updated: activityPerson.updated || timeNow()
                        });
                    }
                }
            }

            if(personsInsert.length) {
                await dbService.batchInsert('activities_persons', personsInsert);
            }

            if(personsUpdate.length) {
                await dbService.batchUpdate('activities_persons', personsUpdate);
            }

            let personFrom = personsLookup.byToken[person_from_token];
            let personTo = personsLookup.byToken[person_to_token];

            if(personTo.grid_id) {
                let personToGrid = await getGridById(personTo.grid_id);

                if(personToGrid) {
                    personTo.grid = personToGrid;
                }
            }

            let returnData = await require('../reviews').setActivityReview({
                activity
            }, {
                personFrom
            }, {
                personTo
            }, no_show, review, true);

            resolve(returnData);
        } catch(e) {
            console.error(e);

            return reject({
                message: e?.message ? e.message : 'Error saving review from network'
            });
        }
    });
}

function syncReviews(from_network, activities) {
    let errorsActivities = {};

    function initErrorForActivity(activity_token, is_activity_error = false) {
        errorsActivities[activity_token] = {
            activity: is_activity_error,
            persons: {},
            reviews: {
                from: {},
                to: {}
            }
        }
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!from_network) {
                return reject({
                    message: 'from_network required'
                });
            }

            if (!activities || !Object.keys(activities).length) {
                return reject({
                    message: 'No activities provided'
                });
            }

            let conn = await dbService.conn();
            let reviewsLookup = await getReviewsLookup();
            let networkSelf = await getNetworkSelf();

            if (!networkSelf.is_befriend) {
                return reject({
                    message: 'Not a Befriend network'
                });
            }

            // Collect all person tokens and activity tokens
            let personTokens = new Set();
            let activityTokens = Object.keys(activities);

            for (let activity_token in activities) {
                const activity = activities[activity_token];

                personTokens.add(activity.person_token);

                // Add person tokens from activity persons
                if (activity.persons) {
                    for(let person_token in activity.persons) {
                        personTokens.add(person_token);
                    }
                }

                // Add person tokens from reviews
                if (activity.reviews && Array.isArray(activity.reviews)) {
                    for(let review of activity.reviews) {
                        personTokens.add(review.person_from_token);
                        personTokens.add(review.person_to_token);
                    }
                }
            }

            // Get all persons
            let persons = await conn('persons')
                .whereIn('person_token', Array.from(personTokens))
                .select('id', 'person_token', 'grid_id');

            let personsLookup = {
                byId: {},
                byToken: {}
            };

            let activitiesLookup = {
                byId: {},
                byToken: {}
            };

            let activitiesPersonsLookup = {};

            let activitiesReviewsLookup = {};

            //create persons lookup
            for (let person of persons) {
                personsLookup.byId[person.id] = person;
                personsLookup.byToken[person.person_token] = person;
            }

            // Get existing data
            let existingActivities = await conn('activities')
                .whereIn('activity_token', activityTokens)
                .select('id', 'activity_token', 'person_id');

            let existingActivityIds = existingActivities.map(activity => activity.id);

            let existingActivitiesPersons = await conn('activities_persons')
                .whereIn('activity_id', existingActivityIds);

            let existingActivitiesReviews = await conn('activities_persons_reviews')
                .whereIn('activity_id', existingActivityIds);

            //create activities lookup
            for (let act of existingActivities) {
                activitiesLookup.byToken[act.activity_token] = act;
                activitiesLookup.byId[act.id] = act;
            }

            //create activities->persons lookup
            for(let ap of existingActivitiesPersons) {
                let activity = activitiesLookup.byId[ap.activity_id];

                if(!activitiesPersonsLookup[activity.activity_token]) {
                    activitiesPersonsLookup[activity.activity_token] = {};
                }

                let person_token = personsLookup.byId[ap.person_id]?.person_token;

                if(!person_token) {
                    continue;
                }

                activitiesPersonsLookup[activity.activity_token][person_token] = ap;
            }

            //create activities->reviews lookup
            for(let ar of existingActivitiesReviews) {
                let activity = activitiesLookup.byId[ar.activity_id];

                let activityPersonRef, activityPersonToRef;

                let activityRef = activitiesReviewsLookup[activity.activity_token];

                if(!activityRef) {
                    activityRef = activitiesReviewsLookup[activity.activity_token] = {};
                }

                let person_from_token = personsLookup.byId[ar.person_from_id]?.person_token;
                let person_to_token = personsLookup.byId[ar.person_to_id]?.person_token;

                if(!person_from_token || !person_to_token) {
                    continue;
                }

                activityPersonRef = activityRef[person_from_token];

                if(!activityRef[person_from_token]) {
                    activityPersonRef = activityRef[person_from_token] = {};
                }

                activityPersonToRef = activityPersonRef[person_to_token];

                if(!activityPersonToRef) {
                    activityPersonToRef = activityPersonRef[person_to_token] = {
                        no_show: {
                            id: null,
                            no_show: null,
                            updated: null
                        },
                        ratings: {}
                    };
                }

                if(ar.review_id) {
                    let review_token = reviewsLookup.byId[ar.review_id]?.token;

                    activityPersonToRef.ratings[review_token] = ar;
                } else {
                    activityPersonToRef.no_show.id = ar.id;
                    activityPersonToRef.no_show.no_show = ar.no_show;
                    activityPersonToRef.no_show.updated = ar.updated;
                }
            }

            //initialize batch inserts/updates
            let personsInsert = [];
            let personsUpdate = [];
            let reviewsInsert = [];
            let reviewsUpdate = [];

            //initialize calculation updates
            let reviewedPersonsRatings = new Set();
            let reviewsPersonsNoShows = new Set();

            let activitiesUpdated = 0;
            let reviewsProcessed = 0;

            for (let activity_token in activities) {
                const activity = activities[activity_token];

                //validate activity
                const errors = validateActivity(activity, true);

                if(errors.length) {
                    initErrorForActivity(activity_token, true);

                    continue;
                }

                // Skip if no reviews to process
                if (!activity.reviews?.length) {
                    initErrorForActivity(activity_token, true);

                    continue;
                }

                // Check if activity exists, if not create it
                let activity_id;
                let existingActivity = activitiesLookup.byToken[activity_token];

                if (existingActivity) {
                    activity_id = existingActivity.id;
                } else {
                    // Get activity creator
                    if (!personsLookup.byToken[activity.person_token]) {
                        console.warn(`Activity creator ${activity.person_token} not found, skipping activity`);

                        initErrorForActivity(activity_token, true);

                        continue;
                    }

                    // Create activity
                    let activityType = await getActivityType(activity.activity_type_token);
                    let mode = await getModeByToken(activity.mode_token);

                    if (!activityType || !mode) {
                        console.warn(`Activity type or mode not found for ${activity_token}, skipping`);

                        initErrorForActivity(activity_token, true);

                        continue;
                    }

                    let activityInsert = {
                        activity_token: activity_token,
                        network_id: from_network.id,
                        activity_type_id: activityType.id,
                        fsq_place_id: activity.fsq_place_id,
                        mode_id: mode.id,
                        person_id: personsLookup.byToken[activity.person_token].id,
                        persons_qty: activity.persons_qty,
                        spots_available: activity.spots_available,
                        activity_start: activity.activity_start,
                        activity_end: activity.activity_end,
                        activity_duration_min: activity.activity_duration_min,
                        in_min: activity.in_min,
                        human_time: activity.human_time,
                        human_date: activity.human_date,
                        is_public: activity.is_public,
                        is_new_friends: activity.is_new_friends || false,
                        is_existing_friends: activity.is_existing_friends || false,
                        location_lat: activity.location_lat,
                        location_lon: activity.location_lon,
                        location_name: activity.location_name,
                        location_address: activity.location_address,
                        location_address_2: activity.location_address_2,
                        location_locality: activity.location_locality,
                        location_region: activity.location_region,
                        location_country: activity.location_country,
                        created: timeNow(),
                        updated: activity.updated || timeNow(),
                    };

                    [activity_id] = await conn('activities')
                        .insert(activityInsert);

                    activitiesUpdated++;
                }

                // Process activity persons
                let existingPersonsOrganized = activitiesPersonsLookup[activity_token] || {};

                // Process activity persons if they exist
                if (activity.persons) {
                    for (let person_token in activity.persons) {
                        // Skip if person not found
                        if (!personsLookup.byToken[person_token]) {
                            if(!errorsActivities[activity_token]) {
                                initErrorForActivity(activity_token, false);
                            }

                            errorsActivities[activity_token].persons[person_token] = true;

                            continue;
                        }

                        let activityPerson = activity.persons[person_token];
                        let person_id = personsLookup.byToken[person_token].id;
                        let existingRecord = existingPersonsOrganized[person_token];

                        if (!existingRecord) {
                            personsInsert.push({
                                activity_id,
                                person_id,
                                is_creator: activityPerson.is_creator || false,
                                accepted_at: activityPerson.accepted_at || null,
                                arrived_at: activityPerson.arrived_at || null,
                                cancelled_at: activityPerson.cancelled_at || null,
                                left_at: activityPerson.left_at || null,
                                created: timeNow(),
                                updated: activityPerson.updated || timeNow()
                            });
                        } else {
                            let hasChanged = false;
                            let fields = ['accepted_at', 'arrived_at', 'cancelled_at', 'left_at'];

                            for (let field of fields) {
                                if (field in activityPerson && activityPerson[field] !== existingRecord[field]) {
                                    hasChanged = true;
                                }
                            }

                            if (hasChanged || debug_enabled) {
                                personsUpdate.push({
                                    id: existingRecord.id,
                                    accepted_at: activityPerson.accepted_at || null,
                                    arrived_at: activityPerson.arrived_at || null,
                                    cancelled_at: activityPerson.cancelled_at || null,
                                    left_at: activityPerson.left_at || null,
                                    updated: activityPerson.updated || timeNow()
                                });
                            }
                        }
                    }
                }

                // Get existing reviews for this activity
                let existingReviewsMap = activitiesReviewsLookup[activity_token];

                // Process reviews
                for (let reviewData of activity.reviews) {
                    //validate persons exist
                    if (!personsLookup.byToken[reviewData.person_from_token] ||
                        !personsLookup.byToken[reviewData.person_to_token]) {

                        initErrorForActivity(activity_token, false);

                        if(!personsLookup.byToken[reviewData.person_from_token]) {
                            errorsActivities[activity_token].reviews.from[reviewData.person_from_token] = true;
                        }

                        if(!personsLookup.byToken[reviewData.person_to_token]) {
                            errorsActivities[activity_token].reviews.to[reviewData.person_to_token] = true;
                        }

                        continue;
                    }

                    //validate person exists on activity
                    if (!activity.persons?.[reviewData.person_from_token]) {
                        initErrorForActivity(activity_token, false);

                        if(!personsLookup.byToken[reviewData.person_from_token]) {
                            errorsActivities[activity_token].reviews.from[reviewData.person_from_token] = true;
                        }

                        continue;
                    }

                    if (!activity.persons?.[reviewData.person_to_token]) {
                        initErrorForActivity(activity_token, false);

                        if(!personsLookup.byToken[reviewData.person_to_token]) {
                            errorsActivities[activity_token].reviews.to[reviewData.person_to_token] = true;
                        }

                        continue;
                    }

                    const personFromId = personsLookup.byToken[reviewData.person_from_token].id;
                    const personToId = personsLookup.byToken[reviewData.person_to_token].id;

                    let reviewId = reviewsLookup.byToken[reviewData.review_token]?.id || null;

                    const existingFromTo = existingReviewsMap?.[reviewData.person_from_token]?.[reviewData.person_to_token];

                    let existingRecord = null;

                    if(reviewData.review_token) {
                        existingRecord = existingFromTo?.ratings[reviewData.review_token] || null;

                        reviewedPersonsRatings.add(reviewData.person_to_token);
                    } else {
                        existingRecord = existingFromTo?.no_show?.id ? existingFromTo.no_show : null;

                        reviewsPersonsNoShows.add(reviewData.person_to_token);
                    }

                    if (!existingRecord) {
                        reviewsInsert.push({
                            person_from_id: personFromId,
                            person_to_id: personToId,
                            activity_id,
                            review_id: reviewId,
                            rating: reviewData.rating,
                            no_show: reviewData.no_show,
                            deleted: reviewData.deleted || null,
                            created: timeNow(),
                            updated: reviewData.updated || timeNow()
                        });
                    } else {
                        let hasChanged = false;

                        if (reviewData.rating !== existingRecord.rating ||
                            reviewData.no_show !== existingRecord.no_show ||
                            reviewData.deleted !== existingRecord.deleted) {
                            hasChanged = true;
                        }

                        if (hasChanged || debug_enabled) {
                            reviewsUpdate.push({
                                id: existingRecord.id,
                                rating: reviewData.rating || null,
                                no_show: reviewData.no_show || null,
                                deleted: reviewData.deleted || null,
                                updated: reviewData.updated || timeNow()
                            });
                        }
                    }
                }
            }

            //process batch inserts/updates
            if (personsInsert.length) {
                await dbService.batchInsert('activities_persons', personsInsert);
            }

            if (personsUpdate.length) {
                await dbService.batchUpdate('activities_persons', personsUpdate);
            }

            if (reviewsInsert.length) {
                await dbService.batchInsert('activities_persons_reviews', reviewsInsert);
                reviewsProcessed += reviewsInsert.length;
            }

            if (reviewsUpdate.length) {
                await dbService.batchUpdate('activities_persons_reviews', reviewsUpdate);
                reviewsProcessed += reviewsUpdate.length;
            }

            //update ratings/no show for each reviewed person
            for (let person_token of reviewedPersonsRatings) {
                if (personsLookup.byToken[person_token]) {
                    const personTo = personsLookup.byToken[person_token];

                    try {
                        await updatePersonRatings(personTo);
                    } catch (e) {
                        console.error(`Error updating ratings for ${person_token}:`, e);
                    }
                }
            }

            for (let person_token of reviewsPersonsNoShows) {
                if (personsLookup.byToken[person_token]) {
                    const personTo = personsLookup.byToken[person_token];

                    try {
                        await updatePersonNoShow(personTo);
                    } catch (e) {
                        console.error(`Error updating no show for ${person_token}:`, e);
                    }
                }
            }

            resolve({
                success: true,
                message: `Processed ${reviewsProcessed} reviews across ${activitiesUpdated} activities`,
                reviewsProcessed,
                activitiesUpdated,
                errors: errorsActivities
            });
        } catch (e) {
            console.error({
                network: from_network.api_domain
            }, 'Error syncing reviews:', e);

            reject({
                message: e?.message || 'Unknown error syncing reviews'
            });
        }
    });
}

module.exports = {
    saveFromNetwork,
    syncReviews
}