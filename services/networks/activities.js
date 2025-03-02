const dbService = require('../db');
const { getNetworkSelf } = require('../network');
const { timeNow, isObject, isNumeric } = require('../shared');
const { results_limit, data_since_ms_extra } = require('./common');
const cacheService = require('../cache');
const { getPerson } = require('../persons');

function updateActivity(from_network, activity_token, activity_data) {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Invalid activity token',
                });
            }

            if (!isObject(activity_data)) {
                return reject({
                    message: 'Invalid update data',
                });
            }

            let { persons, matching, spots } = activity_data;

            if (persons && !isObject(persons)) {
                return reject({
                    message: 'Invalid persons object',
                });
            }

            if (matching && !isObject(matching)) {
                return reject({
                    message: 'Invalid matching format',
                });
            }

            if (spots && !isObject(spots)) {
                return reject({
                    message: 'Invalid spots object',
                });
            }

            let conn = await dbService.conn();

            let activity_check = await conn('activities AS a')
                .join('persons AS p', 'a.person_id', '=', 'p.id')
                .where('network_id', from_network.id)
                .where('activity_token', activity_token)
                .select('a.*', 'p.person_token AS person_from_token')
                .first();

            if (!activity_check) {
                return reject({
                    message: 'Activity not found',
                });
            }

            let cache_key = cacheService.keys.activities(activity_check.person_from_token);

            let cache_activity = await cacheService.hGetItem(cache_key, activity_token);

            if (cache_activity && persons) {
                cache_activity.persons = persons;

                await cacheService.hSet(cache_key, activity_token, cache_activity);
            }

            let network_self = await getNetworkSelf();

            let notification_persons = await conn('activities_notifications AS an')
                .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                .where('activity_id', activity_check.id)
                .where('person_to_network_id', network_self.id)
                .select('person_token');

            for (let person of notification_persons) {
                if (!persons || !(person.person_token in persons)) {
                    continue;
                }

                let personActivity = cache_activity.persons?.[person.person_token];

                if (personActivity?.cancelled_at) {
                    continue;
                }

                let update = {};

                if (persons) {
                    update.persons = persons;
                }

                if (matching) {
                    update.matching = matching[person.person_token];
                }

                if (spots) {
                    update.spots = spots;
                }

                if (Object.keys(update).length) {
                    cacheService.publishWS('activities', person.person_token, {
                        activity_token,
                        ...update,
                    });
                }
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function checkIn(from_network, person_token, activity_token, arrived_at) {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof person_token !== 'string') {
                return reject({
                    message: 'Invalid person token',
                });
            }

            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Invalid activity token',
                });
            }

            if (!isNumeric(arrived_at)) {
                return reject({
                    message: 'Invalid check-in timestamp',
                });
            }

            let person = await getPerson(person_token);

            if (!person) {
                return reject({
                    message: `Person not found`,
                });
            }

            let conn = await dbService.conn();

            let activity_check = await conn('activities AS a')
                .join('persons AS p', 'a.person_id', '=', 'p.id')
                .where('network_id', from_network.id)
                .where('activity_token', activity_token)
                .select('a.*', 'p.person_token AS person_from_token')
                .first();

            if (!activity_check) {
                return reject({
                    message: 'Activity not found',
                });
            }

            let cache_key = cacheService.keys.activities(activity_check.person_from_token);
            let person_activity_cache_key = cacheService.keys.persons_activities(person_token);

            let cache_activity = await cacheService.hGetItem(cache_key, activity_token);
            let personActivity = await cacheService.hGetItem(
                person_activity_cache_key,
                activity_token,
            );

            let activityPerson = cache_activity?.persons?.[person_token];

            if (!activityPerson) {
                return reject({
                    message: `Person not found on activity`,
                });
            }

            if (activityPerson.cancelled_at) {
                return reject({
                    message: `Activity participation cancelled`,
                });
            }

            if (activityPerson.arrived_at) {
                return reject({
                    message: `Person already checked-in`,
                });
            }

            activityPerson.arrived_at = arrived_at;
            personActivity.arrived_at = arrived_at;

            await cacheService.hSet(cache_key, activity_token, cache_activity);
            await cacheService.hSet(person_activity_cache_key, activity_token, personActivity);

            await conn('activities_persons')
                .where('activity_id', activity_check.id)
                .where('person_id', person.id)
                .update({
                    arrived_at,
                    updated: timeNow(),
                });

            let network_self = await getNetworkSelf();

            let notification_persons = await conn('activities_notifications AS an')
                .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                .where('activity_id', activity_check.id)
                .where('person_to_network_id', network_self.id)
                .select('person_token');

            for (let person of notification_persons) {
                let personActivity = cache_activity.persons?.[person.person_token];

                if (!personActivity || personActivity?.cancelled_at) {
                    continue;
                }

                cacheService.publishWS('activities', person.person_token, {
                    activity_token,
                    persons: cache_activity.persons,
                });
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function syncActivities(from_network, inputs) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let my_network = await getNetworkSelf();

            let request_sent = inputs.request_sent ? parseInt(inputs.request_sent) : null;
            let data_since_timestamp = inputs.data_since ? parseInt(inputs.data_since) : null;
            let prev_data_since = inputs.prev_data_since ? parseInt(inputs.prev_data_since) : null;
            let pagination_updated = inputs.pagination_updated
                ? parseInt(inputs.pagination_updated)
                : null;

            if (!request_sent) {
                return reject({
                    message: 'request timestamp required',
                });
            }

            let server_ms_diff = Math.max(0, timeNow() - request_sent);
            let add_data_since_ms = server_ms_diff + data_since_ms_extra;
            let data_since_timestamp_w_extra = null;

            if (data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            //provide data for activities created on my network that include the requesting network's persons
            let qry = conn('activities AS a')
                .join('activities_notifications AS an', 'an.activity_id', '=', 'a.id')
                .select(
                    'an.person_to_id AS person_id',
                    'a.activity_token',
                    'a.is_fulfilled',
                    'a.updated',
                )
                .where('a.network_id', my_network.id)
                .where('an.person_to_network_id', from_network.id)
                .orderBy('a.updated', 'desc')
                .limit(results_limit);

            if (timestamp_updated) {
                qry = qry.where('a.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                qry = qry.where('a.updated', '<=', pagination_updated);
            }

            let activities = await qry;

            // //organize/get/append person token
            // let personIds = new Set();
            // let personIdTokenMap = {};
            //
            // for(let a of activities) {
            //     personIds.add(a.person_id);
            // }
            //
            // try {
            //     let personsQry = await conn('persons')
            //         .whereIn('id', Array.from(personIds))
            //         .select('id', 'person_token');
            //
            //     for(let p of personsQry) {
            //         personIdTokenMap[p.id] = p.person_token;
            //     }
            // } catch(e) {
            //     console.error(e);
            // }

            let duplicateCheck = {};
            let formattedActivities = [];

            for (let activity of activities) {
                if (activity.activity_token in duplicateCheck) {
                    continue;
                }

                formattedActivities.push({
                    // person_token: personIdTokenMap[activity.person_id],
                    activity_token: activity.activity_token,
                    is_fulfilled: activity.is_fulfilled,
                    updated: activity.updated,
                });

                duplicateCheck[activity.activity_token] = true;
            }

            let return_pagination_updated = null;

            if (activities.length === results_limit) {
                return_pagination_updated = activities[activities.length - 1].updated;
            }

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                activities: formattedActivities,
            });
        } catch (e) {
            console.error('Error syncing activities:', e);

            return reject({
                message: 'Error syncing activities',
            });
        }
    });
}

module.exports = {
    updateActivity,
    checkIn,
    syncActivities,
};
