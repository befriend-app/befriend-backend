const cacheService = require('../services/cache');
const dbService = require('../services/db');

const {
    getOptionDateTime,
    isNumeric,
    timeNow,
    generateToken,
    getURL,
    getIPAddr,
    isObject,
    calculateDistanceMeters,
    calculateDistanceFeet,
} = require('./shared');
const { getModes, getKidsAgeLookup, getModeById } = require('./modes');
const { getActivityPlace } = require('./places');
const {
    getNetworkSelf,
    getNetwork,
    getSecretKeyToForNetwork,
    getNetworksLookup,
} = require('./network');
const { getPerson } = require('./persons');
const { getGender } = require('./genders');
const { getPlaceData } = require('./fsq');
const axios = require('axios');
const { isReviewable, getActivityReviews } = require('./reviews');

let debug_create_activity_enabled = require('../dev/debug').activities.create;

let rules = {
    checkIn: {
        minsBefore: 30,
        minsAfter: 20,
        maxDistance: 500, //ft
    },
    unfulfilled: {
        acceptance: {
            minsThreshold: 10,
            error: `Activity can no longer be accepted`,
        },
        noShow: {
            minsThreshold: 20,
        },
    },
    cancellation: {
        'hours-3': {
            max_cancellations: 1,
            time_span_mins: 180,
            is_day: false,
            error: 'Too many activities cancelled in the last 3 hours',
        },
        'hours-6': {
            max_cancellations: 2,
            time_span_mins: 360,
            is_day: false,
            error: 'Too many activities cancelled in the last 6 hours',
        },
        day: {
            max_cancellations: 3,
            time_span_mins: 1440,
            is_day: true,
            error: 'Too many activities cancelled, please try again tomorrow',
        },
    },
};

function cancelActivity(person, activity_token) {
    return new Promise(async (resolve, reject) => {
        let time = timeNow();

        //creator can cancel their participation without the whole activity being cancelled
        let activity_cancelled_at = null;

        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_activity_cache_key = cacheService.keys.persons_activities(person.person_token);
        let debug_enabled = require('../dev/debug').activities.cancel;

        try {
            let conn = await dbService.conn();

            let network_self = await getNetworkSelf();
            let networksLookup = await getNetworksLookup();

            let activityPersonQry = await conn('activities_persons AS ap')
                .join('activities AS a', 'a.id', '=', 'ap.activity_id')
                .where('activity_token', activity_token)
                .where('ap.person_id', person.id)
                .select('ap.*', 'a.person_id AS person_id_from')
                .first();

            if (!activityPersonQry) {
                return reject('Activity does not include person');
            }

            let personFromQry = await conn('persons AS p')
                .where('p.id', activityPersonQry.person_id_from)
                .leftJoin('earth_grid as eg', 'eg.id', '=', 'p.grid_id')
                .select('p.*', 'eg.token')
                .first();

            if (!personFromQry) {
                return reject('Person not found');
            }

            personFromQry.grid = {
                id: personFromQry.grid_id,
                token: personFromQry.token,
            };

            if (activityPersonQry.cancelled_at && !debug_enabled) {
                return reject('Activity already cancelled');
            }

            let activity_cache_key = cacheService.keys.activities(personFromQry.person_token);

            let activity_data = await cacheService.hGetItem(activity_cache_key, activity_token);

            if (!activity_data) {
                return reject('Activity data not found');
            }

            let notifications = (await cacheService.hGetAllObj(notification_cache_key)) || {};

            let person_to_network_id = null;

            if (!activityPersonQry.is_creator) {
                let personNetworkQry = await conn('activities_notifications')
                    .where('activity_id', activityPersonQry.activity_id)
                    .where('person_to_id', person.id)
                    .first();

                person_to_network_id = personNetworkQry?.person_to_network_id;
            }

            //calc active participants remaining
            let activeParticipants = [];

            for (let person_token in activity_data.persons || {}) {
                if (person_token === person.person_token) {
                    continue;
                }

                let _person = activity_data.persons[person_token];

                if (!_person.cancelled_at) {
                    activeParticipants.push(_person);
                }
            }

            //update cached persons object
            for (let person_token in activity_data.persons || {}) {
                if (person_token === person.person_token) {
                    let _person = activity_data.persons[person_token];
                    _person.cancelled_at = time;
                    break;
                }
            }

            //update db
            await conn('activities_persons').where('id', activityPersonQry.id).update({
                cancelled_at: time,
                updated: time,
            });

            //if cancellation is by creator and there are less than two participants remaining, cancel entire activity
            if (activityPersonQry.is_creator && activeParticipants.length < 2) {
                await conn('activities').where('id', activityPersonQry.activity_id).update({
                    cancelled_at: time,
                    updated: time,
                });

                activity_data.cancelled_at = time;

                activity_cancelled_at = time;
            }

            let prev_spots_available = activity_data.spots_available;

            //get updated spots
            let spots = await getActivitySpots(
                personFromQry.person_token,
                activity_token,
                activity_data,
            );

            if (prev_spots_available !== spots.available) {
                activity_data.spots_available = spots.available;

                await conn('activities').where('id', activityPersonQry.activity_id).update({
                    spots_available: spots.available,
                    updated: timeNow(),
                });
            }

            //set cancelled on person activity
            let personActivity = await cacheService.hGetItem(
                person_activity_cache_key,
                activity_token,
            );

            if (personActivity) {
                personActivity.cancelled_at = time;
            }

            //update cache
            await cacheService.hSet(activity_cache_key, activity_token, activity_data);
            await cacheService.hSet(person_activity_cache_key, activity_token, personActivity);

            //merge persons data
            await mergePersonsData(activity_data.persons);

            activity_data.is_reviewable = isReviewable(activity_data);

            //notify 3rd party network of cancellation
            if (person_to_network_id && network_self.id !== person_to_network_id) {
                try {
                    let network = await getNetwork(person_to_network_id);
                    let secret_key_to = await getSecretKeyToForNetwork(person_to_network_id);

                    if (network && secret_key_to) {
                        try {
                            let url = getURL(
                                network.api_domain,
                                `networks/activities/${activity_token}/cancel`,
                            );

                            let r = await axios.put(
                                url,
                                {
                                    network_token: network_self.network_token,
                                    secret_key: secret_key_to,
                                    access_token: activityPersonQry.access_token,
                                    person_token: person.person_token,
                                    cancelled_at: time,
                                },
                                {
                                    timeout: 1000,
                                },
                            );
                        } catch (e) {
                            console.error(e);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            //notify all persons on my network for this activity with most recent data
            //organize network update
            let networksSendPersons = new Set();

            for (let person_token in activity_data.persons) {
                let person_notification = notifications[person_token];

                let is_own_network =
                    person_token === personFromQry.person_token ||
                    person_notification?.person_to_network_id === network_self.id;

                if (is_own_network) {
                    cacheService.publishWS('activities', person_token, {
                        activity_token,
                        persons: activity_data.persons,
                        spots,
                        activity_cancelled_at,
                    });
                } else if (person_notification) {
                    //send update to 3rd-party network
                    networksSendPersons.add(person_notification.person_to_network_id);
                }
            }

            let notify_networks = {};

            //update notified persons
            for (let _person_token in notifications) {
                let data = notifications[_person_token];

                //notify person via websocket if they're on my network
                if (data.person_to_network_id === network_self.id) {
                    //do not send if self or sent above
                    if (
                        _person_token === person.person_token ||
                        _person_token in activity_data.persons
                    ) {
                        continue;
                    }

                    cacheService.publishWS('notifications', _person_token, {
                        activity_token,
                        spots,
                        activity_cancelled_at,
                    });
                } else {
                    //organize 3rd-party networks
                    let network_to = networksLookup.byId[data.person_to_network_id];

                    if (!network_to) {
                        continue;
                    }

                    if (!notify_networks[network_to.network_token]) {
                        notify_networks[network_to.network_token] = network_to;
                    }
                }
            }

            //send spots to 3rd-party networks
            try {
                let ps = [];

                for (let network_token in notify_networks) {
                    let network_to = notify_networks[network_token];

                    let secret_key_to = await getSecretKeyToForNetwork(network_to.id);

                    if (secret_key_to) {
                        try {
                            let url = getURL(
                                network_to.api_domain,
                                `/networks/activities/${activity_token}/notification/spots`,
                            );

                            ps.push(
                                axios.put(
                                    url,
                                    {
                                        network_token: network_self.network_token,
                                        secret_key: secret_key_to,
                                        spots,
                                        persons: activity_data.persons,
                                        activity_cancelled_at: activity_cancelled_at,
                                    },
                                    {
                                        timeout: 1000,
                                    },
                                ),
                            );
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }

                if (ps.length) {
                    await Promise.allSettled(ps);
                }
            } catch (e) {
                console.error(e);
            }

            //send out new notifications
            try {
                require('./notifications').sendNewNotifications(personFromQry, activity_data);
            } catch (e) {
                console.error(e);
            }

            resolve({
                success: true,
                message: activity_cancelled_at
                    ? 'Activity cancelled successfully'
                    : 'Activity participation cancelled',
                cancelled_at: time,
                spots: spots,
                activity_cancelled_at: activity_cancelled_at,
            });
        } catch (e) {
            console.error(e);
            return reject('Error cancelling activity');
        }
    });
}

function createActivity(person, activity) {
    return new Promise(async (resolve, reject) => {
        let matches;

        let activity_cache_key = cacheService.keys.activities(person.person_token);
        let person_activity_cache_key = cacheService.keys.persons_activities(person.person_token);

        //throws rejection if validation/permission errors
        try {
            await prepareActivity(person, activity);
        } catch (errs) {
            return reject(errs);
        }

        try {
            //activity

            // unique across systems
            let network_self = await getNetworkSelf();
            let activity_token = generateToken(20);

            activity.activity_token = activity_token;

            let conn = await dbService.conn();

            let activity_insert = {
                activity_token,
                network_id: network_self.id,
                activity_type_id: activity.activity.data.id,
                fsq_place_id: activity.place?.id || null,
                mode_id: activity.mode.id,
                person_id: person.id,
                persons_qty: activity.friends.qty,
                spots_available: activity.friends.qty,
                activity_start: activity.when.data.start,
                activity_end: activity.when.data.end,
                activity_duration_min: activity.duration,
                in_min: activity.when.data.in_mins,
                human_time: activity.when.data.human.time,
                human_date: activity.when.data.human.datetime,
                is_now: activity.when.data.is_now,
                is_schedule: activity.when.data.is_schedule,
                is_public: true, // Default unless specified otherwise
                is_new_friends: !!(activity.friends.type.is_new || activity.friends.type.is_both),
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

                no_end_time: false,
                custom_filters: !!activity.custom_filters,

                created: timeNow(),
                updated: timeNow(),
            };

            let activity_id = await conn('activities').insert(activity_insert);

            activity_id = activity_id[0];

            activity.activity_id = activity_id;
            activity.updated = activity_insert.updated;

            activity_insert.activity_id = activity_id;
            activity_insert.activity_token = activity_token;
            activity_insert.activity_type_token = activity.activity.token;
            activity_insert.person_token = person.person_token;

            //person activity
            let person_activity_insert = {
                activity_id: activity_id,
                person_id: person.id,
                is_creator: true,
                created: timeNow(),
                updated: timeNow(),
            };

            let person_activity_id =
                await conn('activities_persons').insert(person_activity_insert);

            person_activity_id = person_activity_id[0];
            person_activity_insert.id = person_activity_id;
            person_activity_insert.person_from_token = person.person_token;
            person_activity_insert.activity_token = activity_token;
            person_activity_insert.activity_start = activity_insert.activity_start;
            person_activity_insert.activity_end = activity_insert.activity_end;

            activity_insert.mode = activity.mode;

            let network = await getNetworkSelf(true);

            let activityPersonData = {
                is_creator: true,
                first_name: person.first_name,
                image_url: person.image_url,
                network: {
                    token: network.network_token,
                    name: network.network_name,
                    icon: network.app_icon,
                    domain: getURL(network.base_domain),
                    verified: network.is_verified ? 1 : 0,
                },
            };

            if (activity.mode?.token.includes('partner')) {
                activityPersonData.partner = activity.mode.partner;
            } else if (activity.mode?.token.includes('kids')) {
                activityPersonData.kids = activity.mode.kids;
            }

            activity_insert.persons = {
                [person.person_token]: activityPersonData,
            };

            //save to cache
            try {
                await cacheService.hSet(activity_cache_key, activity_token, activity_insert);
                await cacheService.hSet(
                    person_activity_cache_key,
                    activity_token,
                    person_activity_insert,
                );
            } catch (e) {
                console.error(e);
            }

            try {
                matches = await findMatches(person, activity);

                matches = await require('./matching').filterMatches(
                    person,
                    activity,
                    matches,
                );

                if (matches.length) {
                    await require('../services/notifications').notifyMatches(
                        person,
                        activity,
                        matches,
                    );

                    activity_insert.place = activity.place.data;
                    activity_insert.activity_type = activity.activity.data;

                    activity_insert.is_reviewable = isReviewable(activity_insert);

                    let organized = {
                        ...person_activity_insert,
                        data: activity_insert,
                    };

                    return resolve(organized);
                } else {
                    return reject(
                        'No persons found. Please check your filters or try again later.',
                    );
                }
            } catch (e) {
                if (!e?.message) {
                    console.error(e);
                }

                return reject(e?.message ? e.message : 'Error notifying matches');
            }
        } catch (e) {
            console.error(e);
            return reject('Error creating activity');
        }
    });
}

function checkIn(activity_token, person_token, location, access_token = null) {
    return new Promise(async (resolve, reject) => {
        let debug_enabled = require('../dev/debug').activities.check_in;

        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_activity_cache_key = cacheService.keys.persons_activities(person_token);

        try {
            //validate activity token
            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Invalid activity token',
                });
            }

            //validate person
            if (typeof person_token !== 'string') {
                return reject({
                    message: 'Invalid person token',
                });
            }

            let conn = await dbService.conn();

            let person = await getPerson(person_token);

            if (!person) {
                return reject({
                    message: 'Person not found',
                });
            }

            //validate person-activity and access token if provided
            let activityPersonQry = conn('activities_persons AS ap')
                .join('activities AS a', 'a.id', '=', 'ap.activity_id')
                .where('activity_token', activity_token)
                .where('ap.person_id', person.id)
                .select('ap.*', 'a.person_id AS person_id_from')
                .first();

            if (access_token) {
                activityPersonQry = activityPersonQry.where('access_token', access_token);
            }

            activityPersonQry = await activityPersonQry;

            if (!activityPersonQry) {
                if (access_token) {
                    return reject({
                        message: 'Invalid access token',
                        status: 401,
                    });
                }

                return reject({
                    message: 'Activity does not include person',
                    status: 401,
                });
            }

            let personFromQry = await conn('persons AS p')
                .where('p.id', activityPersonQry.person_id_from)
                .leftJoin('earth_grid as eg', 'eg.id', '=', 'p.grid_id')
                .select('p.*', 'eg.token')
                .first();

            if (!personFromQry) {
                return reject({
                    message: 'Person from not found',
                });
            }

            let activity_cache_key = cacheService.keys.activities(personFromQry.person_token);

            //validate location
            if (!isObject(location) || !isNumeric(location.lat) || !isNumeric(location.lon)) {
                return reject({
                    message: 'Valid location required',
                });
            }

            let activity = await cacheService.hGetItem(activity_cache_key, activity_token);

            if (!activity) {
                return reject({
                    message: 'Activity not found',
                });
            }

            //validate check-in
            //do not allow check-in if person already cancelled their participation
            let myParticipation = activity.persons[person_token];

            if (!myParticipation) {
                return reject({
                    message: 'My participation missing on activity',
                });
            }

            if (myParticipation?.cancelled_at && !debug_enabled) {
                return reject({
                    message: 'Activity participation cancelled',
                });
            }

            //do not allow check-in if activity cancelled
            if (activity.cancelled_at && !debug_enabled) {
                return reject({
                    message: `This activity was cancelled`,
                });
            }

            let distance_ft = calculateDistanceFeet(
                {
                    lat: activity.location_lat,
                    lon: activity.location_lon,
                },
                location,
            );

            if (distance_ft > rules.checkIn.maxDistance && !debug_enabled) {
                return reject({
                    message: `Please check-in when you are within <br>${rules.checkIn.maxDistance}ft of the activity location`,
                });
            }

            if (!activity.persons) {
                return reject({
                    message: 'Persons missing on activity',
                });
            }

            //prevent check-in before threshold
            let checkInStart = activity.activity_start - rules.checkIn.minsBefore * 60;

            if (timeNow(true) < checkInStart && !debug_enabled) {
                return reject({
                    message: `Check-in starts ${rules.checkIn.minsBefore} minutes prior to activity time`,
                });
            }

            let checkInEnd = activity.activity_start + rules.checkIn.minsAfter * 60;

            let latestAcceptance = null;

            for (let pt in activity.persons) {
                let p = activity.persons[pt];

                if (p.is_creator || p.cancelled_at) {
                    continue;
                }

                if (!latestAcceptance || p.accepted_at > latestAcceptance) {
                    latestAcceptance = p.accepted_at;
                }
            }

            //if the latest invitation was accepted after activity start time, use the later time for check-in end
            if (latestAcceptance) {
                latestAcceptance /= 1000; //ms to sec

                if (latestAcceptance > activity.activity_start) {
                    checkInEnd = latestAcceptance + rules.checkIn.minsAfter * 60;
                }
            }

            //prevent check-in if past check-in end time
            if (timeNow(true) > checkInEnd && !debug_enabled) {
                return reject({
                    message: `This activity is no longer accepting check-ins`,
                });
            }

            //update db/cache
            let arrived_at = timeNow();

            await conn('activities_persons').where('id', activityPersonQry.id).update({
                arrived_at,
                updated: timeNow(),
            });

            myParticipation.arrived_at = arrived_at;

            try {
                let personActivity = await cacheService.hGetItem(
                    person_activity_cache_key,
                    activity_token,
                );

                if (personActivity) {
                    personActivity.arrived_at = arrived_at;
                    await cacheService.hSet(
                        person_activity_cache_key,
                        activity_token,
                        personActivity,
                    );
                }
            } catch (e) {
                console.error(e);
            }

            await cacheService.hSet(activity_cache_key, activity_token, activity);

            //merge persons data
            await mergePersonsData(activity.persons);

            activity.is_reviewable = isReviewable(activity);

            //organize ws/cross-network
            let network_self = await getNetworkSelf();
            let networksLookup = await getNetworksLookup();
            let notifications = (await cacheService.hGetAllObj(notification_cache_key)) || {};

            let person_to_network_id = null;

            if (!activityPersonQry.is_creator) {
                let personNetworkQry = await conn('activities_notifications')
                    .where('activity_id', activityPersonQry.activity_id)
                    .where('person_to_id', person.id)
                    .first();

                person_to_network_id = personNetworkQry?.person_to_network_id;
            }

            //notify 3rd party network of check-in
            if (person_to_network_id && network_self.id !== person_to_network_id) {
                try {
                    let network = await getNetwork(person_to_network_id);
                    let secret_key_to = await getSecretKeyToForNetwork(person_to_network_id);

                    if (network && secret_key_to) {
                        try {
                            let url = getURL(
                                network.api_domain,
                                `networks/activities/${activity_token}/check-in`,
                            );

                            let r = await axios.post(
                                url,
                                {
                                    network_token: network_self.network_token,
                                    secret_key: secret_key_to,
                                    person_token: person_token,
                                    arrived_at,
                                },
                                {
                                    timeout: 1000,
                                },
                            );
                        } catch (e) {
                            console.error(e);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            //notify all persons on my network for this activity with check-in update
            //organize network update
            let networksSendPersons = new Set();

            for (let person_token in activity.persons) {
                let person_notification = notifications[person_token];

                let is_own_network =
                    person_token === personFromQry.person_token ||
                    person_notification?.person_to_network_id === network_self.id;

                if (is_own_network) {
                    cacheService.publishWS('activities', person_token, {
                        activity_token,
                        persons: activity.persons,
                    });
                } else if (person_notification) {
                    //send update to 3rd-party network
                    networksSendPersons.add(person_notification.person_to_network_id);
                }
            }

            //send persons data to networks
            if (networksSendPersons.size) {
                try {
                    let ps = [];

                    for (let network_id of networksSendPersons) {
                        let network_to = networksLookup.byId[network_id];

                        let secret_key_to = await getSecretKeyToForNetwork(network_to.id);

                        if (secret_key_to) {
                            try {
                                let url = getURL(
                                    network_to.api_domain,
                                    `/networks/activities/${activity_token}`,
                                );

                                ps.push(
                                    axios.put(
                                        url,
                                        {
                                            network_token: network_self.network_token,
                                            secret_key: secret_key_to,
                                            persons: activity.persons,
                                        },
                                        {
                                            timeout: 1000,
                                        },
                                    ),
                                );
                            } catch (e) {
                                console.error(e);
                            }
                        }
                    }

                    if (ps.length) {
                        await Promise.allSettled(ps);
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            resolve({
                arrived_at,
                success: true,
                message: 'Check-In Successful',
            });
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error checking in for activity',
            });
        }
    });
}

function getActivityTypes() {
    function organizeActivityType(activity) {
        let data = {
            name: activity.activity_name,
            title: activity.activity_title,
            notification: activity.notification_name,
            duration: activity.default_duration_min,
            token: activity.activity_type_token,
            image: activity.activity_image,
            emoji: activity.activity_emoji,
            categories: [],
            sub: {},
        };

        //include bool
        for (let k in activity) {
            if (k.startsWith('is_')) {
                if (activity[k]) {
                    data[k] = activity[k];
                }
            }
        }

        return data;
    }

    return new Promise(async (resolve, reject) => {
        if (module.exports.types) {
            return resolve(module.exports.types);
        }

        //use existing data in cache if exists
        let cache_key = cacheService.keys.activity_types;
        let data = await cacheService.getObj(cache_key);

        if (data) {
            module.exports.types = data;
            return resolve(data);
        }

        let conn = await dbService.conn();

        let data_organized = {};

        //organize by activity types
        let parent_activity_types = await conn('activity_types')
            .whereNull('parent_activity_type_id')
            .orderBy('sort_position');

        //level 1
        for (let at of parent_activity_types) {
            data_organized[at.id] = organizeActivityType(at);
        }

        //level 2
        for (let parent_id in data_organized) {
            let level_2_qry = await conn('activity_types').where(
                'parent_activity_type_id',
                parent_id,
            );

            for (let at of level_2_qry) {
                data_organized[parent_id].sub[at.id] = organizeActivityType(at);
            }
        }

        //level 3
        for (let parent_id in data_organized) {
            let level_2_dict = data_organized[parent_id].sub;

            for (let level_2_id in level_2_dict) {
                let level_3_qry = await conn('activity_types').where(
                    'parent_activity_type_id',
                    level_2_id,
                );

                for (let at of level_3_qry) {
                    data_organized[parent_id].sub[level_2_id].sub[at.id] = organizeActivityType(at);
                }
            }
        }

        await cacheService.setCache(cache_key, data_organized);

        module.exports.types = data_organized;

        return resolve(data_organized);
    });
}

function getActivityTypesMapping() {
    return new Promise(async (resolve, reject) => {
        try {
            if (module.exports.activityTypesMapping) {
                return resolve(module.exports.activityTypesMapping);
            }

            let activityTypes = await module.exports.getActivityTypes();
            let organized = {};

            for (let id in activityTypes) {
                let level_1 = activityTypes[id];

                organized[level_1.token] = id;

                if (level_1.sub) {
                    for (let id_2 in level_1.sub) {
                        let level_2 = level_1.sub[id_2];

                        organized[level_2.token] = id_2;

                        if (level_2.sub) {
                            for (let id_3 in level_2.sub) {
                                let level_3 = level_2.sub[id_3];

                                organized[level_3.token] = id_3;
                            }
                        }
                    }
                }
            }

            module.exports.activityTypesMapping = organized;
            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getActivityType(activity_type_token = null, activity_type_id = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (activity_type_token) {
                if (module.exports.lookup.byToken[activity_type_token]) {
                    return resolve(module.exports.lookup.byToken[activity_type_token]);
                }
            } else if (activity_type_id) {
                if (module.exports.lookup.byId[activity_type_id]) {
                    return resolve(module.exports.lookup.byId[activity_type_id]);
                }
            }

            if (activity_type_token) {
                let cache_key = cacheService.keys.activity_type(activity_type_token);

                let cached_data = await cacheService.getObj(cache_key);

                if (cached_data) {
                    module.exports.lookup.byToken[activity_type_token] = cached_data;
                    module.exports.lookup.byId[cached_data.id] = cached_data;
                    return resolve(cached_data);
                }
            }

            let conn = await dbService.conn();

            let qry;

            if (activity_type_token) {
                qry = await conn('activity_types')
                    .where('activity_type_token', activity_type_token)
                    .first();
            } else if (activity_type_id) {
                qry = await conn('activity_types')
                    .where('id', activity_type_id)
                    .first();
            }

            if (!qry) {
                return resolve(null);
            }

            module.exports.lookup.byId[qry.id] = qry;
            module.exports.lookup.byToken[qry.activity_type_token] = qry;

            await cacheService.setCache(
                cacheService.keys.activity_type(qry.activity_type_token),
                qry,
            );

            resolve(qry);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function prepareActivity(person, activity) {
    return new Promise(async (resolve, reject) => {
        //validation
        let errors = [];

        if (!person) {
            return reject('Person required');
        }

        if (!activity) {
            return reject('Activity data required');
        }

        if (!activity.person?.mode) {
            errors.push('Mode required');
        } else {
            try {
                let modes = await getModes();

                let mode = modes?.byToken[activity.person.mode];

                if (!mode) {
                    errors.push('Invalid mode provided');
                } else {
                    activity.mode = {
                        id: mode.id,
                        token: mode.token,
                        name: mode.name,
                    };

                    //validate/prepare partner/kids
                    if (mode.token.includes('partner')) {
                        try {
                            activity.mode.partner = await validatePartnerForActivity(
                                activity.mode,
                                person.person_token,
                                errors,
                            );
                        } catch (e) {}
                    } else if (mode.token.includes('kids')) {
                        try {
                            activity.mode.kids = await validateKidsForActivity(
                                activity.mode,
                                person.person_token,
                                errors,
                            );
                        } catch (e) {}
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }

        //activity type/name
        if (!activity.activity) {
            errors.push('Missing activity');
        } else {
            if (activity.activity.token) {
                try {
                    let activity_type = await getActivityType(activity.activity.token);

                    if (!activity_type) {
                        errors.push('Invalid activity type');
                    } else {
                        activity.activity.data = activity_type;
                    }
                } catch (e) {
                    console.error(e);
                    errors.push('Activity type error');
                }
            } else {
                let default_activity = await module.exports.getDefaultActivity();

                try {
                    activity.activity.data = default_activity;
                } catch (e) {
                    console.error(e);
                    errors.push('Default activity type error');
                }
            }
        }

        //duration
        let duration_valid = false;

        if (!activity.duration) {
            errors.push('Duration required');
        } else if (activity.duration < module.exports.durations.min) {
            errors.push(`Minimum duration is ${module.exports.durations.min} min`);
        } else if (activity.duration > module.exports.durations.max) {
            errors.push(`Max duration is ${(module.exports.durations.max / 60).toFixed(0)} hours`);
        } else if (!module.exports.durations.options.includes(activity.duration)) {
            errors.push(`Invalid duration`);
        } else {
            duration_valid = true;
        }

        //place
        if (!activity.place || !activity.place.id) {
            errors.push('Place id required');
        } else {
            let place;

            try {
                place = await getActivityPlace(activity);
            } catch (e) {
                console.error(e);
                errors.push('Place address error');
            }

            if (!place) {
                errors.push('Place not found');
            } else if (!place.location_lat || !place.location_lon) {
                errors.push('Lat/lon required');
            } else {
                activity.place.data = place;
            }
        }

        let when_option = activity.when ? module.exports.when.options[activity.when.id] : null;

        //travel/distance
        if (!activity.travel || !activity.travel.token) {
            errors.push('Travel token required');
        } else if (!module.exports.travelModes.includes(activity.travel.mode)) {
            errors.push('Invalid travel mode');
        } else {
            try {
                let travel = await cacheService.getObj(
                    cacheService.keys.travel_times(activity.travel.token),
                );

                if (!travel) {
                    errors.push('Travel data required');
                } else {
                    activity.travel.data = travel;

                    let travel_time = travel.modes[activity.travel.mode];

                    if (
                        !when_option ||
                        travel_time.total >
                            when_option.in_mins + module.exports.thresholds.startTimeTravelTime
                    ) {
                        errors.push('Update your location or activity time');
                    }
                }
            } catch (e) {
                console.error(e);
                errors.push('Travel data error');
            }
        }

        //when
        if (
            !activity.when ||
            !activity.when.id ||
            !(activity.when.id in module.exports.when.options)
        ) {
            errors.push('Invalid activity start time');
        } else if (!duration_valid) {
            //do nothing, handled above
        } else {
            let date;

            if (when_option.is_schedule) {
                //todo schedule
            } else {
                date = getOptionDateTime(when_option);
            }

            activity.when.data = {
                is_now: !!when_option.is_now,
                is_schedule: !!when_option.is_schedule,
                in_mins: when_option.in_mins ? when_option.in_mins : null,
                start: date.unix(),
                end: date.add(activity.duration, 'minutes').unix(),
                human: {
                    time: date.tz(activity.travel?.data?.to.tz).format(`h:mm a`),
                    datetime: date.tz(activity.travel?.data?.to.tz).format(`YYYY-MM-DD HH:mm:ssZ`),
                },
            };
        }

        //friends
        let friend_type_valid = false;

        if (activity.friends && activity.friends.type) {
            let bool_count = 0;

            for (let k in activity.friends.type) {
                if (activity.friends.type[k]) {
                    bool_count++;
                }
            }

            if (bool_count === 1) {
                friend_type_valid = true;
            }
        }

        if (!friend_type_valid) {
            errors.push('Invalid friend type');
        }

        //number_persons
        try {
            let activity_friends_max = await getMaxFriends(person);

            if (
                !activity.friends ||
                !isNumeric(activity.friends?.qty) ||
                activity.friends.qty < 1
            ) {
                errors.push('Friends qty required');
            } else if (activity.friends.qty > activity_friends_max) {
                errors.push(`Max friends: ${activity_friends_max}`);
            }
        } catch (e) {
            console.error(e);
            errors.push('Error validating friends qty');
        }

        //return validation errors
        if (errors.length) {
            return reject(errors);
        }

        try {
            //check if this activity overlaps with any other activities
            let cache_key = cacheService.keys.persons_activities(person.person_token);
            let activitiesData = await cacheService.hGetAllObj(cache_key);

            let time = activity.when.data;

            let overlaps = await doesActivityOverlap(person.person_token, time, activitiesData);

            if (overlaps && !debug_create_activity_enabled) {
                return reject(['Activity time overlaps with current activity']);
            }

            //prevent creation of too many activities within a short time period in the event of cancellation
            let too_many_activities_cancelled = await tooManyActivitiesCancelled(
                person.person_token,
                time,
                activitiesData,
            );

            if (too_many_activities_cancelled && !debug_create_activity_enabled) {
                return reject([too_many_activities_cancelled]);
            }
        } catch (e) {
            console.error(e);
            return reject(['Error validating activity times']);
        }

        return resolve(true);
    });
}

function formatActivityData(person, activity) {
    return new Promise(async (resolve, reject) => {
        try {
            activity.activityType = await getActivityType(null, activity.activity_type_id);

            if (!activity.place) {
                activity.place = {
                    id: activity.fsq_place_id,
                };
            }

            if (!activity.duration) {
                activity.duration = activity.activity_duration_min;
            }

            if (!activity.when) {
                activity.when = {
                    in_mins: activity.in_min,
                    data: {
                        start: activity.activity_start,
                        end: activity.activity_end,
                        human: {
                            time: activity.human_time,
                            datetime: activity.human_date,
                        },
                    },
                };
            }

            if (!activity.friends) {
                activity.friends = {
                    qty: activity.persons_qty,
                    type: {
                        is_new: activity.is_new_friends,
                        is_existing: activity.is_existing_friends,
                    },
                };
            }

            if (!activity.person) {
                let mode = await getModeById(activity.mode_id);

                activity.person = {
                    mode: mode.token,
                };
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function validatePartnerForActivity(mode, person_token, errors = []) {
    return new Promise(async (resolve, reject) => {
        if (!mode?.token?.includes('partner')) {
            return resolve();
        }

        let partner = {};

        try {
            let person_modes = await cacheService.hGetItem(
                cacheService.keys.person(person_token),
                'modes',
            );

            if (!person_modes) {
                errors.push('Modes missing');
            } else if (!person_modes?.selected?.includes('mode-partner')) {
                errors.push('Partner mode not active');
            } else {
                if (!isObject(person_modes.partner)) {
                    errors.push('No partner available');
                } else {
                    let isValid = !!person_modes.partner?.gender_id;

                    if (!isValid) {
                        errors.push('Active partner and gender required');
                    } else {
                        try {
                            let gender = await getGender(person_modes.partner.gender_id);

                            partner = {
                                gender: {
                                    name: gender.gender_name,
                                },
                            };
                        } catch (e) {
                            console.error(e);
                            errors.push('Error preparing partner');
                        }
                    }
                }
            }

            if (errors.length) {
                return reject(errors);
            }

            resolve(partner);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function validateKidsForActivity(mode, person_token, errors = []) {
    return new Promise(async (resolve, reject) => {
        if (!mode?.token?.includes('kids')) {
            return resolve();
        }

        let organized_kids = {};

        try {
            let person_modes = await cacheService.hGetItem(
                cacheService.keys.person(person_token),
                'modes',
            );

            if (!person_modes) {
                errors.push('Modes missing');
            } else if (!person_modes?.selected?.includes('mode-kids')) {
                errors.push('Kids mode not active');
            } else {
                if (!isObject(person_modes.kids)) {
                    errors.push('No kids available');
                } else {
                    let isValid = false;

                    for (let k in person_modes.kids) {
                        let kid = person_modes.kids[k];

                        if (kid.age_id && kid.gender_id && kid.is_active && !kid.deleted) {
                            isValid = true;
                            break;
                        }
                    }

                    if (!isValid) {
                        errors.push('Active kid age and gender required');
                    } else {
                        try {
                            let kidsAgeLookup = await getKidsAgeLookup();

                            //key of age token-gender token
                            for (let k in person_modes.kids) {
                                let kid = person_modes.kids[k];

                                let age = kidsAgeLookup.byId[kid.age_id];
                                let gender = await getGender(kid.gender_id);

                                let key = `${age.token}-${gender.gender_token}`;

                                if (!organized_kids[key]) {
                                    organized_kids[key] = {
                                        age: {
                                            name: `${age.range.min} - ${age.range.max}`,
                                        },
                                        gender: {
                                            token: gender.gender_token,
                                            name: gender.gender_name,
                                        },
                                        qty: 0,
                                    };
                                }

                                organized_kids[key].qty++;
                            }
                        } catch (e) {
                            console.error(e);
                            errors.push('Error preparing kids data');
                        }
                    }
                }
            }

            if (errors.length) {
                return reject(errors);
            }

            resolve(organized_kids);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function doesActivityOverlap(person_token, time, activitiesData = null) {
    return new Promise(async (resolve, reject) => {
        let overlaps = false;

        try {
            if (!time?.start || !time?.end) {
                return resolve(false);
            }

            if (!activitiesData) {
                let cache_key = cacheService.keys.persons_activities(person_token);

                activitiesData = await cacheService.hGetAllObj(cache_key);
            }

            if (!activitiesData) {
                return resolve(false);
            }

            for (let k in activitiesData) {
                let activity = activitiesData[k];

                //skip cancelled or unfulfilled activities
                if (
                    activity.cancelled_at ||
                    ('is_fulfilled' in activity && !activity.is_fulfilled)
                ) {
                    continue;
                }

                if (time.start >= activity.activity_start && time.start < activity.activity_end) {
                    overlaps = true;
                    break;
                }

                if (time.end > activity.activity_start && time.end <= activity.activity_end) {
                    overlaps = true;
                    break;
                }

                if (time.start <= activity.activity_start && time.end >= activity.activity_end) {
                    overlaps = true;
                    break;
                }
            }

            resolve(overlaps);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function tooManyActivitiesCancelled(person_token, time, activitiesData = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!activitiesData) {
                let cache_key = cacheService.keys.persons_activities(person_token);
                activitiesData = await cacheService.hGetAllObj(cache_key);
            }

            if (!activitiesData) {
                return resolve(false);
            }

            let currentTime = timeNow();

            let startOfDay = new Date(currentTime).setHours(0, 0, 0, 0);

            let todayCancelledActivities = Object.values(activitiesData)
                .filter(
                    (activity) =>
                        activity.cancelled_at &&
                        activity.cancelled_at >= startOfDay &&
                        activity.cancelled_at <= currentTime,
                )
                .sort((a, b) => b.cancelled_at - a.cancelled_at);

            if (todayCancelledActivities.length === 0) {
                return resolve(false);
            }

            for (const [ruleKey, rule] of Object.entries(rules.cancellation)) {
                let timeSpanMs = rule.time_span_mins * 60 * 1000;
                let timeThreshold = rule.is_day ? startOfDay : currentTime - timeSpanMs;

                let cancellationsInTimespan = todayCancelledActivities.filter(
                    (activity) => activity.cancelled_at >= timeThreshold,
                ).length;

                if (cancellationsInTimespan > rule.max_cancellations) {
                    return resolve(rule.error);
                }
            }

            return resolve(false);
        } catch (e) {
            console.error('Error checking cancelled activities:', e);
            return reject(e);
        }
    });
}

function getDefaultActivity() {
    return new Promise(async (resolve, reject) => {
        let key = cacheService.keys.activity_type_default;

        try {
            let data = await cacheService.getObj(key);

            if (data) {
                return resolve(data);
            }

            let conn = await dbService.conn();

            let qry = await conn('activity_types').where('is_meet', true).first();

            if (qry) {
                await cacheService.setCache(key, qry);

                return resolve(qry);
            }
        } catch (e) {
            console.error(e);
        }

        return reject();
    });
}

function findMatches(person, activity) {
    return new Promise(async (resolve, reject) => {
        try {
            let matches = await require('./matching').getMatchesServer(person, {
                activity,
                send_only: true,
            });

            resolve(matches?.matches?.send || []);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getActivitySpots(person_from_token, activity_token, activity_data = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!activity_data) {
                let cache_key = cacheService.keys.activities(person_from_token);
                activity_data = (await cacheService.hGetItem(cache_key, activity_token)) || {};
            }

            if (!Object.keys(activity_data?.persons || {}).length) {
                return reject('No persons on activity');
            }

            let friends_qty = activity_data.persons_qty;
            let persons_accepted = 0;
            let creatorCancelled = false;

            //check if creator cancelled
            for (let person_token in activity_data.persons) {
                let person = activity_data.persons[person_token];

                if (person.is_creator && person.cancelled_at) {
                    creatorCancelled = true;
                    break;
                }
            }

            for (let person_token in activity_data.persons) {
                let person = activity_data.persons[person_token];

                if (!person.is_creator && !person.cancelled_at) {
                    persons_accepted++;
                }
            }

            //add an extra spot if creator cancelled
            if (creatorCancelled) {
                friends_qty++;
            }

            let availableSpots = friends_qty - persons_accepted;

            //if activity is cancelled, set spots to 0
            if (activity_data.cancelled_at) {
                availableSpots = 0;
            }

            resolve({
                accepted: persons_accepted,
                available: availableSpots,
            });
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function isActivityInvitable(person_token, activity_token, spots = null) {
    return new Promise(async (resolve, reject) => {
        try {
            let activity = await cacheService.hGetItem(
                cacheService.keys.activities(person_token),
                activity_token,
            );

            if (activity.cancelled_at) {
                return resolve(false);
            }

            if (!spots) {
                spots = await getActivitySpots(person_token, activity_token, activity);
            }

            if (spots.available <= 0) {
                return resolve(false);
            }

            resolve(true);
        } catch (e) {
            reject(e);
        }
    });
}

function getActivityNotification(activity_token, person_token) {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Activity token required',
                });
            }

            let me = await getPerson(person_token);

            if (!me) {
                return reject({
                    message: 'person token not found',
                });
            }

            //ensure person exists on activity invite
            let notification = await cacheService.hGetItem(
                cacheService.keys.activities_notifications(activity_token),
                person_token,
            );

            if (!notification) {
                return reject({
                    message: 'Activity does not include person',
                });
            }

            let cache_key = cacheService.keys.activities(notification.person_from_token);

            let activity = await cacheService.hGetItem(cache_key, activity_token);

            if (!activity) {
                return reject({
                    message: 'Activity not found',
                });
            }

            notification.activity_token = activity_token;

            activity.place = await getPlaceData(activity.fsq_place_id);

            activity.activity_type = await getActivityType(activity.activity_type_token);

            let person_from = await getPerson(notification.person_from_token);

            let gender = await getGender(person_from.gender_id);

            let matching = await require('./matching').personToPersonInterests(me, person_from);

            return resolve({
                activity_token,
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

            return reject({
                message: 'Error getting activity',
            });
        }
    });
}

function getActivityNotificationWithAccessToken(activity_token, access_token, person_token, req) {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof activity_token !== 'string') {
                return reject({
                    message: 'Activity token required',
                    status: 400,
                });
            }

            if (typeof access_token !== 'string') {
                return reject({
                    message: 'Access token required',
                    status: 400,
                });
            }

            if (typeof person_token !== 'string') {
                return reject({
                    message: 'Person token required',
                    status: 400,
                });
            }

            const me = await getPerson(person_token);

            if (!me) {
                return reject({
                    message: 'Person token not found',
                    status: 400,
                });
            }

            const conn = await dbService.conn();

            //access token check
            const access_token_qry = await conn('activities_notifications AS an')
                .join('persons AS p', 'p.id', '=', 'an.person_to_id')
                .where('p.person_token', person_token)
                .where('an.access_token', access_token)
                .select('an.*', 'p.first_name', 'p.image_url')
                .first();

            if (!access_token_qry) {
                return reject({
                    message: 'Invalid activity person/access token',
                    status: 401,
                });
            }

            //set access-token used if not previously set
            if (!access_token_qry.access_token_used_at) {
                await conn('activities_notifications')
                    .where('id', access_token_qry.id)
                    .update({
                        access_token_used_at: timeNow(),
                        access_token_ip: getIPAddr(req),
                        updated: timeNow(),
                    });
            }

            //ensure person exists on activity invite
            const notification = await cacheService.hGetItem(
                cacheService.keys.activities_notifications(activity_token),
                person_token,
            );

            if (!notification) {
                return reject({
                    message: 'Activity does not include person',
                    status: 400,
                });
            }

            notification.activity_token = activity_token;
            const cache_key = cacheService.keys.activities(notification.person_from_token);
            const activity = await cacheService.hGetItem(cache_key, activity_token);

            if (!activity) {
                return reject({
                    message: 'Activity not found',
                    status: 400,
                });
            }

            //enrich activity data
            activity.place = await getPlaceData(activity.fsq_place_id);
            activity.activity_type = await getActivityType(activity.activity_type_token);

            const person_from = await getPerson(notification.person_from_token);
            const gender = await getGender(person_from.gender_id);
            const matching = await require('./matching').personToPersonInterests(me, person_from);
            const networkSelf = await getNetworkSelf();

            let first_name = null;
            let image_url = null;

            if (!access_token_qry.access_token_used_at) {
                first_name = person_from.first_name;
                image_url = person_from.image_url;
            }

            return resolve({
                activity_token,
                notification,
                activity,
                matching,
                person: {
                    gender,
                    first_name,
                    image_url,
                    is_new: person_from.is_new,
                    age: person_from.age,
                    reviews: person_from.reviews,
                },
                access: {
                    token: access_token,
                    domain: getURL(networkSelf.api_domain),
                },
                network: {
                    token: networkSelf.network_token,
                    name: networkSelf.network_name,
                    icon: networkSelf.app_icon,
                    website: getURL(networkSelf.base_domain),
                    verified: networkSelf.is_verified,
                },
            });
        } catch (e) {
            console.error(e);
            return reject({
                message: 'Error getting activity',
                status: 400,
            });
        }
    });
}

function getActivity(person_token, activity_token, access_token = null) {
    return new Promise(async (resolve, reject) => {
        let spots = {},
            place = {},
            matching = {};

        try {
            //validate access token
            if (access_token) {
                let conn = await dbService.conn();

                let access_token_qry = await conn('activities_persons AS ap')
                    .join('persons AS p', 'p.id', '=', 'ap.person_id')
                    .where('ap.access_token', access_token)
                    .where('p.person_token', person_token)
                    .first();

                if (!access_token_qry) {
                    return reject({
                        message: 'Invalid access token',
                        status: 401,
                    });
                }
            }

            let me = await getPerson(person_token);

            if (!me) {
                return reject({
                    message: 'Person not found',
                    status: 400,
                });
            }

            //ensure person exists on activity
            let person_activity = await cacheService.hGetItem(
                cacheService.keys.persons_activities(person_token),
                activity_token,
            );

            if (!person_activity) {
                return reject({
                    message: 'Activity does not include person',
                    status: 400,
                });
            }

            let cache_key = cacheService.keys.activities(person_activity.person_from_token);

            let activity = await cacheService.hGetItem(cache_key, activity_token);

            if (!activity) {
                return reject({
                    message: 'Activity not found',
                    status: 400,
                });
            }

            activity.reviews = await getActivityReviews(activity.activity_id, me.id);
            activity.is_reviewable = isReviewable(activity);

            activity.persons = filterActivityPersons(activity.persons, person_token);

            spots = {
                available: activity.spots_available,
                accepted: activity.persons_qty - activity.spots_available,
            };

            //if I cancelled, set accepted to 0
            if (activity.persons?.[person_token]?.cancelled_at) {
                spots.accepted = 0;
            }

            place = await getPlaceData(activity.fsq_place_id);

            let pipeline = cacheService.startPipeline();

            //get person attributes and matching data
            for (let _person_token in activity.persons) {
                if (_person_token === person_token) {
                    continue;
                }

                try {
                    pipeline.hmGet(cacheService.keys.person(_person_token), [
                        'age',
                        'gender_id',
                        'is_new',
                        'reviews',
                    ]);

                    matching[_person_token] =
                        await require('./matching').personToPersonInterests(me, {
                            person_token: _person_token,
                        });
                } catch (e) {
                    console.error(e);
                }
            }

            let results = await cacheService.execPipeline(pipeline);

            let idx = 0;

            //merge results into persons object
            for (let _person_token in activity.persons || {}) {
                if (_person_token === person_token) {
                    continue;
                }

                let result = results[idx++];

                let gender = await getGender(result[1]);

                activity.persons[_person_token] = {
                    ...activity.persons[_person_token],
                    gender,
                    age: result[0] ? parseInt(result[0]) : null,
                    is_new: !!(result[2] && isNumeric(result[2]) && parseInt(result[2])),
                    reviews: JSON.parse(result[3]),
                };
            }

            let organized = {
                ...person_activity,
                data: {
                    ...activity,
                    place,
                    spots,
                    matching,
                },
            };

            resolve(organized);
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error getting activity',
                status: 400,
            });
        }
    });
}

function isActivityTypeExcluded(activity, filter) {
    if (!filter?.is_active) {
        return false;
    }

    let filtered_activity = Object.values(filter.items || {}).find(
        (item) => item.activity_type_id === activity.activity?.data?.id,
    );

    if (!filtered_activity) {
        return false;
    }

    return filtered_activity.is_negative;
}

function getPersonActivities(person) {
    return new Promise(async (resolve, reject) => {
        try {
            let person_activities =
                (await cacheService.hGetAllObj(
                    cacheService.keys.persons_activities(person.person_token),
                )) || {};

            if (Object.keys(person_activities).length) {
                let pipeline = cacheService.startPipeline();

                for (let activity_token in person_activities) {
                    let activity = person_activities[activity_token];

                    pipeline.hGet(
                        cacheService.keys.activities(activity.person_from_token),
                        activity_token,
                    );
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                for (let activity_token in person_activities) {
                    let activity = person_activities[activity_token];

                    activity.data = JSON.parse(results[idx++]);
                    activity.data.is_reviewable = isReviewable(activity.data);
                }
            }

            //if I cancelled my participation in the activity, only show the creator
            for (let activity_token in person_activities) {
                let activity = person_activities[activity_token];

                if (activity.data?.persons) {
                    activity.data.persons = filterActivityPersons(
                        activity.data.persons,
                        person.person_token,
                    );
                }
            }

            resolve(person_activities);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getMaxFriends(person) {
    return new Promise(async (resolve, reject) => {
        try {
            let person_activities = await getPersonActivities(person);

            if (!Object.keys(person_activities).length) {
                return resolve(module.exports.friends.max.default);
            }

            let activities_count = 0;

            for (let activity_token in person_activities) {
                let activity = person_activities[activity_token];

                if (!activity.cancelled_at && timeNow(true) > activity.activity_end) {
                    activities_count++;
                }
            }

            let max = Math.min(activities_count + module.exports.friends.max.default, module.exports.friends.max.max);

            return resolve(max);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function mergePersonsData(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!isObject(persons) || !Object.keys(persons).length) {
                return resolve();
            }

            let pipeline = cacheService.startPipeline();

            for (let person_token in persons) {
                pipeline.hmGet(cacheService.keys.person(person_token), [
                    'age',
                    'gender_id',
                    'is_new',
                    'reviews',
                ]);
            }

            let results = await cacheService.execPipeline(pipeline);

            let idx = 0;

            //merge results into persons object
            for (let person_token in persons || {}) {
                let result = results[idx++];

                let gender = {};

                try {
                    gender = await getGender(result[1]);
                } catch (e) {}

                persons[person_token] = {
                    ...persons[person_token],
                    gender,
                    age: result[0] ? parseInt(result[0]) : null,
                    is_new: !!(result[2] && isNumeric(result[2]) && parseInt(result[2])),
                    reviews: JSON.parse(result[3]),
                };
            }

            resolve();
        } catch (e) {
            return reject(e);
        }
    });
}

function filterActivityPersons(persons, my_person_token) {
    if (persons) {
        let activityPersonsCopy = structuredClone(persons);

        for (let person_token in persons) {
            let activity_person = persons[person_token];

            if (person_token === my_person_token) {
                if (activity_person.cancelled_at) {
                    for (let _person_token in activityPersonsCopy) {
                        let _activity_person = activityPersonsCopy[_person_token];

                        if (!_activity_person.is_creator && _person_token !== my_person_token) {
                            delete activityPersonsCopy[_person_token];
                        }
                    }

                    break;
                }
            }
        }

        persons = activityPersonsCopy;
    }

    return persons;
}

function validateActivity(activity, is_on_review = false) {
    const errors = [];

    if (!activity?.activity_token) {
        errors.push('Activity token required');
    }

    if (!activity.place?.id && !activity.fsq_place_id) {
        errors.push('FSQ place id required');
    }

    if (!activity.activity?.token && !activity.activityType?.activity_type_token && !activity.activity_type_token) {
        errors.push('Activity type token required');
    }

    if (!activity.duration && !activity.activity_duration_min) {
        errors.push('Activity duration required');
    }

    if(!is_on_review) {
        if (!activity.when?.data?.start || activity.when.data.start < timeNow(true)) {
            errors.push('Invalid activity start time');
        }

        if (!activity.when?.data?.end || activity.when.data.end < timeNow(true)) {
            errors.push('Invalid activity end time');
        }

        if (!activity.when?.data?.human?.time || !activity.when?.data?.human?.datetime) {
            errors.push('Human time required');
        }

        if (!activity.friends?.type || !isNumeric(activity.friends?.qty)) {
            errors.push('Friends type and qty required');
        }

        if (!activity.person?.mode) {
            errors.push('Mode token required');
        }
    } else {
        if(!activity.activity_start) {
            errors.push('Activity start time required');
        }

        if(!activity.activity_end) {
            errors.push('Activity end time required');
        }

        if(!activity.human_time || !activity.human_date) {
            errors.push('Human time required');
        }

        if(!(activity.is_new_friends && !activity.is_existing_friends) || !isNumeric(activity.persons_qty)) {
            errors.push('Friends type and qty required');
        }
    }

    if (!activity.when?.in_mins && !activity.in_min) {
        errors.push('In minutes required');
    }

    if (!activity.spots?.available && !activity.spots_available) {
        errors.push('Available spots needed');
    }

    if (!activity.mode && !activity.mode_token) {
        errors.push('Mode required');
    }

    return errors;
}

module.exports = {
    rules,
    types: null,
    activityTypesMapping: null,
    lookup: {
        byId: {},
        byToken: {},
    },
    durations: {
        min: 10,
        max: 360,
        options: [
            10, 15, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240, 270, 300,
            330, 360,
        ],
    },
    thresholds: {
        startTimeTravelTime: 5, //mins
    },
    travelModes: ['driving', 'walking', 'bicycle'],
    friends: {
        types: ['is_new', 'is_existing', 'is_both'],
        max: {
            default: 2,
            max: 10,
        },
    },
    when: {
        options: {
            now: { id: 'now', name: 'Now', value: 'Now', is_now: true, in_mins: 5 },
            schedule: { id: 'schedule', name: 'Schedule', is_schedule: true },
            15: { id: 15, value: '15', unit: 'mins', in_mins: 15 },
            30: { id: 30, value: '30', unit: 'mins', in_mins: 30 },
            45: { id: 45, value: '45', unit: 'mins', in_mins: 45 },
            60: { id: 60, value: '1', unit: 'hr', in_mins: 60 },
            90: { id: 90, value: '1.5', unit: 'hrs', in_mins: 90 },
            120: { id: 120, value: '2', unit: 'hrs', in_mins: 120 },
            150: { id: 150, value: '2.5', unit: 'hrs', in_mins: 150 },
            180: { id: 180, value: '3', unit: 'hrs', in_mins: 180 },
            210: { id: 210, value: '3.5', unit: 'hrs', in_mins: 210 },
            240: { id: 240, value: '4', unit: 'hrs', in_mins: 240 },
            270: { id: 270, value: '4.5', unit: 'hrs', in_mins: 270 },
            300: { id: 300, value: '5', unit: 'hrs', in_mins: 300 },
            330: { id: 330, value: '5.5', unit: 'hrs', in_mins: 330 },
            360: { id: 360, value: '6', unit: 'hrs', in_mins: 360 },
            390: { id: 390, value: '6.5', unit: 'hrs', in_mins: 390 },
            420: { id: 420, value: '7', unit: 'hrs', in_mins: 420 },
            450: { id: 450, value: '7.5', unit: 'hrs', in_mins: 450 },
            480: { id: 480, value: '8', unit: 'hrs', in_mins: 480 },
        },
    },
    cancelActivity,
    createActivity,
    checkIn,
    getActivity,
    getActivityTypes,
    getActivityTypesMapping,
    getActivityType,
    getDefaultActivity,
    getPersonActivities,
    getActivitySpots,
    isActivityInvitable,
    getActivityNotification,
    getActivityNotificationWithAccessToken,
    getMaxFriends,
    prepareActivity,
    formatActivityData,
    findMatches,
    doesActivityOverlap,
    tooManyActivitiesCancelled,
    isActivityTypeExcluded,
    validateActivity,
    validateKidsForActivity,
    validatePartnerForActivity,
    mergePersonsData,

};
