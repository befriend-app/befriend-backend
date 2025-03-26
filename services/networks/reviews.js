const { getNetworkSelf } = require('../network');
const { isObject, timeNow } = require('../shared');
const { friends, validateActivity, getActivityType } = require('../activities');
const dbService = require('../db');
const { getModeByToken } = require('../modes');
const { getGridById } = require('../grid');

function saveFromNetwork(from_network, activity, person_from_token, person_to_token, review, no_show) {
    return new Promise(async (resolve, reject) => {
        try {
            //initial validation
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
    return new Promise(async (resolve, reject) => {
        console.log(from_network, activities);
    });
}

module.exports = {
    saveFromNetwork,
    syncReviews
}