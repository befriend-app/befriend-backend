const axios = require('axios');
const http2 = require('http2');
const jwt = require('jsonwebtoken');

const { timeNow, generateToken, getURL, isNumeric, sanitizePrivateKey } = require('./shared');

const activitiesService = require('./activities');
const cacheService = require('./cache');
const dbService = require('./db');
const {
    getNetworkSelf,
    getNetworksLookup,
    getSecretKeyToForNetwork,
    getNetwork,
} = require('./network');
const { getPerson } = require('./persons');
const { getGender } = require('./genders');
const { hGetAllObj } = require('./cache');
const {
    validatePartnerForActivity,
    validateKidsForActivity,
    mergePersonsData,
    getActivitySpots,
    rules,
} = require('./activities');
const { getPlaceData } = require('./fsq');
const { isReviewable } = require('./reviews');

let notification_groups = {
    group_1: {
        size: 1,
        delay: 0,
    },
    group_2: {
        size: 3,
        delay: 5000,
    },
    group_3: {
        size: 5,
        delay: 10000,
    },
    group_4: {
        size: 10,
        delay: 15000,
    },
    group_5: {
        size: 20,
        delay: 30000,
    },
    group_6: {
        size: 40,
        delay: 60000,
    },
};

function getPayload(activity_network, me, activity) {
    let title_arr = [];
    let plus_str = '';
    let emoji_str = '';
    let time_str = activity.when?.time?.formatted || activity.human_time;
    let place_str = '';

    let friends_qty = activity.friends?.qty || activity.persons_qty;

    if (friends_qty > 1) {
        plus_str = ` (+${friends_qty - 1})`;
    }

    let place_name = activity.place?.data?.name || activity.location_name;

    if (place_name) {
        place_str = `at ${place_name}`;
    }

    let is_address = activity.place?.is_address || activity.is_address || false;

    if (is_address) {
        //
    } else {
        let emoji =
            activity?.activity?.data.activity_emoji || activity.activityType?.activity_emoji;

        if (emoji) {
            emoji_str = emoji + ' ';
        }

        let activityTypeName = activity.activity?.name || activity.activityType?.notification_name;

        if (activityTypeName) {
            title_arr.push(activityTypeName);
        }

        title_arr.push(`at ${time_str}`);
    }

    return {
        title: `${emoji_str}Invite: ${title_arr.join(' ')}`,
        body: `Join ${me.first_name}${plus_str} ${place_str}`,
        data: {
            activity_token: activity.activity_token,
            network_token: activity_network.network_token,
        },
    };
}

function notifyMatches(me, activity, matches, on_send_new = false) {
    let cancelSend = false,
        mySendingInt = 0,
        prevSendingInt = null;
    let sending_cache_key = cacheService.keys.activities_notifications_sending_int(
        activity?.activity_token,
    );

    let conn, payload, my_network, networksLookup;

    let notifications_cache_key = cacheService.keys.activities_notifications(
        activity.activity_token,
    );

    let activityCopy = structuredClone(activity);

    let friends_qty = activity.friends?.qty || activity.persons_qty;

    delete activityCopy.activity_id;
    delete activityCopy.travel;
    delete activityCopy.place?.data?.id;

    function organizeGroupSend(group, payload) {
        let platforms = {
            ios: {
                tokens: {},
                devices: {},
            },
            android: {
                tokens: {},
                devices: {},
            },
        };

        let notify_networks_persons = {};

        for (let to_person of group) {
            // own network
            let has_device = false;

            if (to_person.networks.includes(my_network.network_token)) {
                if (to_person.device.platform === 'ios') {
                    platforms.ios.tokens[to_person.device.token] = payload;

                    platforms.ios.devices[to_person.device.token] = to_person;

                    has_device = true;
                } else if (to_person.device.platform === 'android') {
                    platforms.android.tokens[to_person.device.token] = payload;
                    platforms.android.devices[to_person.device.token] = to_person;

                    has_device = true;
                }
            }

            if (!has_device) {
                // 3rd party network
                let prevent_duplicates = {};

                for (let network of to_person.networks) {
                    if (!prevent_duplicates[network]) {
                        prevent_duplicates[network] = {};
                    }

                    if (!notify_networks_persons[network]) {
                        notify_networks_persons[network] = [];
                    }

                    if (!prevent_duplicates[network][to_person.person_token]) {
                        prevent_duplicates[network][to_person.person_token] = true;
                        notify_networks_persons[network].push(to_person);
                    }
                }
            }
        }

        return {
            platforms,
            notify_networks_persons,
        };
    }

    function sendGroupNotifications(group, delay) {
        setTimeout(async function () {
            //check if activity has already been fulfilled
            if (cancelSend) {
                return;
            }

            if (!group.length) {
                return;
            }

            try {
                let currentSendingInt = await cacheService.getObj(sending_cache_key);

                if (currentSendingInt !== mySendingInt) {
                    cancelSend = true;
                    return;
                }
            } catch (e) {
                console.error(e);
            }

            let spots;

            try {
                spots = await getActivitySpots(me.person_token, activity.activity_token);
            } catch (e) {
                console.error(e);
            }

            if (delay > 0 || on_send_new) {
                try {
                    let isInvitable = await activitiesService.isActivityInvitable(
                        me.person_token,
                        activity.activity_token,
                        spots,
                    );

                    if (!isInvitable) {
                        cancelSend = true;
                    }

                    if (cancelSend) {
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            activityCopy.spots = spots;

            let { platforms, notify_networks_persons } = organizeGroupSend(group, payload);

            //send notifications
            if (Object.keys(platforms.ios.tokens).length) {
                try {
                    await iosSendGroup(platforms.ios);
                } catch (e) {
                    console.error(e);
                }
            }

            if (Object.keys(platforms.android.tokens).length) {
                try {
                    await androidSendGroup(platforms.android);
                } catch (e) {
                    console.error(e);
                }
            }

            if (Object.keys(notify_networks_persons).length) {
                try {
                    await networksSendGroup(notify_networks_persons);
                } catch (e) {
                    console.error(e);
                }
            }
        }, delay);
    }

    function iosSendGroup(ios) {
        return new Promise(async (resolve, reject) => {
            try {
                let batch_insert = [];
                let to_persons = [];

                let results = await sendIOSBatch(ios.tokens, true);

                let devices_failed = [];

                //2. add to db/cache
                for (let result of results) {
                    let is_success = false;
                    let device_token = null;

                    let sent = result.sent?.[0];
                    let failed = result.failed?.[0];

                    if (sent) {
                        device_token = sent.device;

                        if (sent.status === 'success') {
                            is_success = true;
                        }
                    } else if(failed) {
                        devices_failed.push(failed);
                    }

                    if (failed) {
                        device_token = failed.device;
                    }

                    if (!device_token) {
                        console.error('No device token found');
                        continue;
                    }

                    let to_person = ios.devices[device_token];

                    to_persons.push(to_person);

                    let insert = {
                        activity_id: activity.activity_id,
                        person_from_id: me.id,
                        person_to_id: to_person.person_id,
                        person_from_network_id: my_network.id,
                        person_to_network_id: my_network.id,
                        sent_at: timeNow(),
                        created: timeNow(),
                        updated: timeNow(),
                    };

                    if (is_success) {
                        insert.is_success = true;
                    } else {
                        insert.is_failed = true;
                    }

                    batch_insert.push(insert);
                }

                if (batch_insert.length) {
                    await dbService.batchInsert('activities_notifications', batch_insert, true);

                    let pipeline = cacheService.startPipeline();

                    for (let i = 0; i < batch_insert.length; i++) {
                        let insert = batch_insert[i];
                        let to_person = to_persons[i];

                        insert.person_from_token = me.person_token;
                        insert.friends_qty = friends_qty;

                        pipeline.hSet(
                            notifications_cache_key,
                            to_person.person_token,
                            JSON.stringify(insert),
                        );

                        let person_notifications_cache_key =
                            cacheService.keys.persons_notifications(to_person.person_token);

                        pipeline.hSet(
                            person_notifications_cache_key,
                            activity.activity_token,
                            JSON.stringify(insert),
                        );
                    }

                    await cacheService.execPipeline(pipeline);
                }

                if(devices_failed.length) {
                    console.error({
                        notifications_failed: devices_failed
                    });
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function androidSendGroup(android) {
        return new Promise(async (resolve, reject) => {
            //todo
            resolve();
        });
    }

    function networksSendGroup(notify_networks_persons, spots) {
        return new Promise(async (resolve, reject) => {
            try {
                //track which persons have already been sent to
                let persons_networks = {};

                for (let network_token in notify_networks_persons) {
                    let network = networksLookup.byToken[network_token];

                    if (!network) {
                        continue;
                    }

                    let secret_key_to = await getSecretKeyToForNetwork(network.id);

                    if (!secret_key_to) {
                        continue;
                    }

                    let network_persons = notify_networks_persons[network_token];

                    let organized = {};

                    let batch_insert = [];

                    for (let network_person of network_persons) {
                        //in case person belongs to multiple networks and we already delivered a notification request to a network
                        if (persons_networks[network_person.person_token]) {
                            continue;
                        }

                        let data = {
                            activity_id: activity.activity_id,
                            person_from_id: me.id,
                            person_to_id: network_person.person_id,
                            person_from_network_id: my_network.id,
                            person_to_network_id: network.id,
                            sent_to_network_at: timeNow(),
                            access_token: generateToken(16),
                            created: timeNow(),
                            updated: timeNow(),
                        };

                        batch_insert.push(data);

                        organized[network_person.person_token] = {
                            access_token: data.access_token,
                            person_from_first_name: me.first_name || null,
                            person_from_token: me.person_token,
                            person_to_token: network_person.person_token,
                            sent_to_network_at: data.sent_to_network_at,
                            updated: data.updated,
                        };
                    }

                    if (batch_insert.length) {
                        let organized_person_tokens = Object.keys(organized);

                        // (1) add to db
                        await dbService.batchInsert('activities_notifications', batch_insert, true);

                        // (2) add to cache
                        let pipeline = cacheService.startPipeline();

                        for (let i = 0; i < batch_insert.length; i++) {
                            let insert = batch_insert[i];
                            let to_person = organized[organized_person_tokens[i]];

                            insert.person_from_token = me.person_token;
                            insert.friends_qty = friends_qty;

                            pipeline.hSet(
                                notifications_cache_key,
                                to_person.person_to_token,
                                JSON.stringify(insert),
                            );

                            let person_notifications_cache_key =
                                cacheService.keys.persons_notifications(to_person.person_to_token);

                            pipeline.hSet(
                                person_notifications_cache_key,
                                activity.activity_token,
                                JSON.stringify(insert),
                            );
                        }

                        await cacheService.execPipeline(pipeline);

                        // (3) post to network
                        try {
                            let url = getURL(
                                network.api_domain,
                                'networks/activities/notifications',
                            );

                            let r = await axios.post(
                                url,
                                {
                                    secret_key: secret_key_to,
                                    network_token: my_network.network_token,
                                    person_from_token: me.person_token,
                                    activity: activityCopy,
                                    persons: organized,
                                    spots,
                                },
                                {
                                    timeout: 2000,
                                },
                            );

                            let activity_notification_ids = batch_insert.map((item) => item.id);

                            await conn('activities_notifications')
                                .whereIn('id', activity_notification_ids)
                                .update({
                                    did_network_receive: r.status === 201,
                                    updated: timeNow(),
                                });

                            if (r.status === 201) {
                                for (let person_token in organized) {
                                    persons_networks[person_token] = true;
                                }
                            }
                        } catch (e) {
                            if (e?.status >= 500) {
                                //network offline?
                            } else {
                                console.error(e);
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        try {
            conn = await dbService.conn();
            my_network = await getNetworkSelf();
            networksLookup = await getNetworksLookup();

            payload = getPayload(my_network, me, activity);
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        //organize matches into sending groups
        //stagger sending
        //prevent parallel sending in case of cancellation/sending of new notifications
        try {
            prevSendingInt = await cacheService.getObj(sending_cache_key);

            if (isNumeric(prevSendingInt)) {
                mySendingInt = prevSendingInt + 1;
            }

            await cacheService.setCache(sending_cache_key, mySendingInt, 1800);
        } catch (e) {
            console.error(e);
        }

        let groups_organized = {};
        let group_keys = Object.keys(notification_groups);
        let persons_multiplier = Math.max(friends_qty, 1);

        let currentIndex = 0;

        for (let i = 0; i < group_keys.length; i++) {
            let group_key = group_keys[i];
            let group_size = notification_groups[group_key].size;
            let total_group_size = group_size * persons_multiplier;

            groups_organized[group_key] = {
                persons: matches.slice(currentIndex, currentIndex + total_group_size),
            };

            currentIndex += total_group_size;

            if (currentIndex >= matches.length) {
                break;
            }
        }

        for (let group_key in groups_organized) {
            let group_matches = groups_organized[group_key].persons;

            let group_delay = notification_groups[group_key];

            sendGroupNotifications(group_matches, group_delay.delay);
        }

        resolve();
    });
}

function getPersonNotifications(person) {
    return new Promise(async (resolve, reject) => {
        let person_notification_cache_key = cacheService.keys.persons_notifications(
            person.person_token,
        );

        try {
            let notifications = (await hGetAllObj(person_notification_cache_key)) || {};

            if (Object.keys(notifications).length) {
                let network_self = await getNetworkSelf();

                let pipeline = cacheService.startPipeline();

                for (let activity_token in notifications) {
                    let activity = notifications[activity_token];

                    //activity
                    pipeline.hGet(
                        cacheService.keys.activities(activity.person_from_token),
                        activity_token,
                    );

                    //person image
                    pipeline.hGet(
                        cacheService.keys.person(activity.person_from_token),
                        'image_url',
                    );
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                for (let activity_token in notifications) {
                    try {
                        let activity = notifications[activity_token];
                        activity.activity_token = activity_token;

                        activity.activity = JSON.parse(results[idx++]);

                        activity.person = {
                            image_url: results[idx++],
                        };

                        //add access token if 3rd party network
                        if (activity.person_from_network_id !== network_self.id) {
                            let network_to = await getNetwork(activity.person_from_network_id);

                            activity.access = {
                                token: activity.access_token,
                                domain: getURL(network_to.api_domain),
                            };
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            resolve(notifications);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function acceptNotification(person, activity_token) {
    return new Promise(async (resolve, reject) => {
        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_activity_cache_key = cacheService.keys.persons_activities(person.person_token);
        let person_notification_cache_key = cacheService.keys.persons_notifications(
            person.person_token,
        );

        let debug_enabled = require('../dev/debug').activities.accept;

        try {
            //ensure person exists on activity invite
            let notifications = await cacheService.hGetAllObj(notification_cache_key);

            let notification = notifications?.[person.person_token];

            if (!notification) {
                return reject('Activity does not include person');
            }

            //notification already declined
            if (notification.declined_at) {
                return reject('Activity cannot be accepted');
            }

            //notification already accepted
            if (notification.accepted_at) {
                return reject('Activity already accepted');
            }

            let activity_cache_key = cacheService.keys.activities(notification.person_from_token);

            let activity_data = await cacheService.hGetItem(activity_cache_key, activity_token);

            if (!activity_data) {
                return reject('Activity data not found');
            }

            //entire activity cancelled
            if (activity_data.cancelled_at) {
                return reject('Activity cancelled');
            }

            //this person already cancelled their participation
            if (activity_data.persons?.[person.person_token]?.cancelled_at) {
                return reject('Activity participation cancelled');
            }

            //current time is x minutes past activity start time
            if (
                timeNow(true) - activity_data.activity_start >
                rules.unfulfilled.acceptance.minsThreshold * 60
            ) {
                return reject(rules.unfulfilled.acceptance.error);
            }

            let spots = await activitiesService.getActivitySpots(
                notification.person_from_token,
                activity_token,
                activity_data,
            );

            if (spots.available <= 0) {
                return reject('Unavailable: max spots reached');
            }

            let conn = await dbService.conn();

            let network_self = await getNetworkSelf();
            let networksLookup = await getNetworksLookup();

            let time = timeNow();

            let personActivities = await cacheService.hGetAllObj(person_activity_cache_key);

            //prevent accepting if person accepted a different activity during the same time
            let activity_overlaps = await activitiesService.doesActivityOverlap(
                person.person_token,
                {
                    start: activity_data.activity_start,
                    end: activity_data.activity_end,
                },
                personActivities,
            );

            if (activity_overlaps && !debug_enabled) {
                return reject('Activity overlaps with existing activity');
            }

            spots.accepted++;
            spots.available--;

            let update = {
                accepted_at: time,
                updated: time,
            };

            notification = {
                ...notification,
                ...update,
            };

            let person_network = await getNetwork(notification.person_to_network_id);

            let activityPersonData = {
                accepted_at: time,
                first_name: person.first_name || null,
                image_url: person.image_url || null,
                network: {
                    token: person_network.network_token,
                    name: person_network.network_name,
                    icon: person_network.app_icon,
                    domain: getURL(person_network.base_domain),
                    verified: person_network.is_verified ? 1 : 0,
                },
            };

            if (activity_data.mode?.token.includes('partner')) {
                try {
                    activityPersonData.partner = await validatePartnerForActivity(
                        activity_data.mode,
                        person.person_token,
                    );
                } catch (e) {
                    console.error(e);
                }
            } else if (activity_data.mode?.token.includes('kids')) {
                try {
                    activityPersonData.kids = await validateKidsForActivity(
                        activity_data.mode,
                        person.person_token,
                    );
                } catch (e) {
                    console.error(e);
                }
            }

            activity_data.persons[person.person_token] = activityPersonData;

            activity_data.spots_available = spots.available;

            let pipeline = cacheService.startPipeline();

            pipeline.hSet(activity_cache_key, activity_token, JSON.stringify(activity_data));
            pipeline.hSet(
                notification_cache_key,
                person.person_token,
                JSON.stringify(notification),
            );
            pipeline.hSet(
                person_notification_cache_key,
                activity_token,
                JSON.stringify(notification),
            );

            await cacheService.execPipeline(pipeline);

            await conn('activities').where('id', notification.activity_id).update({
                spots_available: spots.available,
                updated: timeNow(),
            });

            await conn('activities_notifications').where('id', notification.id).update(update);

            //add to own activities list
            let person_activity_insert = {
                accepted_at: time,
                activity_id: notification.activity_id,
                person_id: person.id,
                is_creator: false,
                created: time,
                updated: time,
            };

            //add access token and first_name/image for 3rd party network acceptance
            if (network_self.id !== notification.person_to_network_id) {
                //access token
                person_activity_insert.access_token = generateToken(16);

                //first name
                if (person.first_name) {
                    person_activity_insert.first_name = person.first_name;
                }

                //image url
                if (person.image_url) {
                    person_activity_insert.image_url = person.image_url;
                }
            }

            let person_activity_id =
                await conn('activities_persons').insert(person_activity_insert);

            person_activity_id = person_activity_id[0];

            person_activity_insert = {
                ...person_activity_insert,
                id: person_activity_id,
                activity_token,
                person_from_token: notification.person_from_token,
                activity_start: activity_data.activity_start,
                activity_end: activity_data.activity_end,
            };

            await cacheService.hSet(
                person_activity_cache_key,
                activity_token,
                person_activity_insert,
            );

            try {
                await mergePersonsData(activity_data.persons);
            } catch (e) {
                console.error(e);
            }

            activity_data.is_reviewable = isReviewable(activity_data);

            //append access object
            if (person_activity_insert.access_token) {
                person_activity_insert.access = {
                    token: person_activity_insert.access_token,
                    domain: getURL(network_self.api_domain),
                };
            }

            //notify 3rd party network of acceptance
            if (network_self.id !== notification.person_to_network_id) {
                try {
                    let network = await getNetwork(notification.person_to_network_id);
                    let secret_key_to = await getSecretKeyToForNetwork(
                        notification.person_to_network_id,
                    );

                    if (network && secret_key_to) {
                        try {
                            let url = getURL(
                                network.api_domain,
                                `networks/activities/${activity_token}/notification/accept`,
                            );

                            let r = await axios.put(
                                url,
                                {
                                    network_token: network_self.network_token,
                                    secret_key: secret_key_to,
                                    person_token: person.person_token,
                                    access_token: person_activity_insert.access_token,
                                    accepted_at: time,
                                },
                                {
                                    timeout: 1000,
                                },
                            );

                            if (r.status === 202) {
                                //update db/cache with server-side first_name/image_url if different from client data
                                let update = {};

                                if (r.data.first_name && r.data.first_name !== person.first_name) {
                                    update.first_name = r.data.first_name;
                                }

                                if (r.data.image_url && r.data.image_url !== person.image_url) {
                                    update.image_url = r.data.image_url;
                                }

                                if (Object.keys(update).length) {
                                    await conn('activities_persons')
                                        .where('id', person_activity_id)
                                        .update({
                                            ...update,
                                            updated: timeNow(),
                                        });

                                    let pipeline = cacheService.startPipeline();

                                    activity_data.persons[person.person_token] = {
                                        first_name: update.first_name || person.first_name || null,
                                        image_url: update.image_url || person.image_url || null,
                                    };

                                    pipeline.hSet(
                                        person_activity_cache_key,
                                        activity_token,
                                        JSON.stringify({
                                            ...person_activity_insert,
                                            ...update,
                                        }),
                                    );

                                    pipeline.hSet(
                                        activity_cache_key,
                                        activity_token,
                                        JSON.stringify(activity_data),
                                    );

                                    await cacheService.execPipeline(pipeline);
                                }
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            //notify all persons on my network that accepted this activity with most recent data
            //organize network update with persons->accepted
            let personsData = {};
            let personsMatching = {};
            let networksSendPersons = new Set();

            for (let person_token in activity_data.persons) {
                try {
                    personsData[person_token] = await getPerson(person_token);
                } catch (e) {
                    console.error(e);
                }
            }

            for (let person_token in activity_data.persons) {
                let person_a = personsData[person_token];

                if (!person_a) {
                    continue;
                }

                let data = activity_data.persons[person_token];

                if (data.cancelled_at) {
                    continue;
                }

                let person_notification = notifications[person_token];

                let is_own_network =
                    person_token === notification.person_from_token ||
                    person_notification?.person_to_network_id === network_self.id;

                let matching = {};

                for (let _person_token in activity_data.persons) {
                    if (_person_token === person_token) {
                        continue;
                    }

                    let person_b = personsData[_person_token];

                    if (!person_b) {
                        continue;
                    }

                    matching[_person_token] =
                        await require('./matching').personToPersonInterests(
                            person_a,
                            person_b,
                        );
                }

                personsMatching[person_token] = matching;

                if (is_own_network) {
                    cacheService.publishWS('activities', person_token, {
                        activity_token,
                        persons: activity_data.persons,
                        matching,
                        spots,
                    });
                } else {
                    //send persons to this 3rd-party network
                    networksSendPersons.add(person_notification.person_to_network_id);
                }
            }

            let notify_networks = {};

            //send current spots data to notified persons via ws
            for (let _person_token in notifications) {
                let data = notifications[_person_token];

                //notify person via websocket if they're on my network
                if (data.person_to_network_id === network_self.id) {
                    if (_person_token !== person.person_token) {
                        //send notification update
                        cacheService.publishWS('notifications', _person_token, {
                            activity_token,
                            spots,
                        });
                    }
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
                                            persons: activity_data.persons,
                                            matching: personsMatching,
                                            spots,
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

            activity_data.place = await getPlaceData(activity_data.fsq_place_id);
            activity_data.matching = personsMatching[person.person_token] || {};

            resolve({
                success: true,
                message: 'Notification accepted successfully',
                activity: {
                    ...person_activity_insert,
                    data: {
                        ...activity_data,
                    },
                },
            });
        } catch (e) {
            console.error(e);
            return reject('Error accepting activity');
        }
    });
}

function declineNotification(person, activity_token) {
    return new Promise(async (resolve, reject) => {
        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_notification_cache_key = cacheService.keys.persons_notifications(
            person.person_token,
        );

        try {
            //ensure person exists on activity invite
            let notification = await cacheService.hGetItem(
                notification_cache_key,
                person.person_token,
            );

            if (!notification) {
                return reject('Activity does not include person');
            }

            if (notification.accepted_at) {
                return reject('Activity cannot be declined');
            }

            if (notification.declined_at) {
                return reject('Activity already declined');
            }

            let activity_cache_key = cacheService.keys.activities(notification.person_from_token);

            let activity_data = await cacheService.hGetItem(activity_cache_key, activity_token);

            if (!activity_data) {
                return reject('Activity data not found');
            }

            if (activity_data.cancelled_at) {
                return reject('Activity cancelled');
            }

            let conn = await dbService.conn();

            let network_self = await getNetworkSelf();

            //update db/cache
            let time = timeNow();

            let update = {
                declined_at: time,
                updated: time,
            };

            notification = {
                ...notification,
                ...update,
            };

            let pipeline = cacheService.startPipeline();

            pipeline.hSet(
                notification_cache_key,
                person.person_token,
                JSON.stringify(notification),
            );
            pipeline.hSet(
                person_notification_cache_key,
                activity_token,
                JSON.stringify(notification),
            );

            await cacheService.execPipeline(pipeline);

            await conn('activities_notifications').where('id', notification.id).update(update);

            //3rd-party network
            if (network_self.id !== notification.person_to_network_id) {
                //notify network of decline
                let network = await getNetwork(notification.person_to_network_id);
                let secret_key_to = await getSecretKeyToForNetwork(
                    notification.person_to_network_id,
                );

                if (network && secret_key_to) {
                    try {
                        let url = getURL(
                            network.api_domain,
                            `networks/activities/${activity_token}/notification/decline`,
                        );

                        await axios.put(url, {
                            network_token: network_self.network_token,
                            secret_key: secret_key_to,
                            person_token: person.person_token,
                            declined_at: time,
                        });
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            resolve({
                success: true,
                message: 'Notification declined successfully',
            });
        } catch (e) {
            console.error(e);
            return reject('Error declining activity');
        }
    });
}

function sendNewNotifications(person, activity) {
    return new Promise(async (resolve, reject) => {
        try {
            await require('../services/activities').formatActivityData(person, activity);

            let matches = await require('../services/activities').findMatches(person, activity);

            matches = await require('./matching').filterMatches(
                person,
                activity,
                matches,
                true,
            );

            if (matches.length) {
                await require('../services/notifications').notifyMatches(
                    person,
                    activity,
                    matches,
                    true,
                );
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

//ios
let provider = null;

const createAPNSConnection = async (baseURL) => {
    const connect = () => {
        return new Promise((resolve, reject) => {
            const client = http2.connect(baseURL);

            client.once('connect', () => resolve(client));
            client.once('error', reject);

            // Remove error listener after successful connection
            client.once('connect', () => client.removeListener('error', reject));
        });
    };

    let client = await connect();

    const reconnect = async () => {
        if (client) {
            client.close();
        }
        try {
            client = await connect();

            client.on('error', async (err) => {
                console.error('HTTP/2 client error:', err);
                client = await reconnect();
            });

            client.on('goaway', async () => {
                client = await reconnect();
            });
        } catch (error) {
            console.error('Reconnection failed:', error);
            // Exponential backoff could be implemented here
            throw error;
        }
        return client;
    };

    client.on('error', async (err) => {
        console.error('HTTP/2 client error:', err);
        client = await reconnect();
    });

    client.on('goaway', async () => {
        client = await reconnect();
    });

    // Check connection health periodically
    setInterval(
        async () => {
            if (!client?.socket?.connecting) {
                try {
                    client = await reconnect();
                } catch (error) {
                    console.error('Health check reconnection failed:', error);
                }
            }
        },
        30 * 60 * 1000,
    );

    return {
        getClient: () => client,
        close: () => client && client.close(),
        reconnect,
    };
};

function createTokenManager(keyId, teamId, privateKey) {
    const state = {
        currentToken: null,
        tokenExpiry: null,
    };

    function generateNewToken() {
        const header = {
            alg: 'ES256',
            kid: keyId,
        };

        const claims = {
            iss: teamId,
        };

        state.currentToken = jwt.sign(claims, privateKey, {
            algorithm: 'ES256',
            header: header,
            expiresIn: '1h',
        });

        state.tokenExpiry = Date.now() + 55 * 60 * 1000;
    }

    function getToken() {
        try {
            const now = Date.now();

            if (state.currentToken && state.tokenExpiry && now < state.tokenExpiry) {
                return state.currentToken;
            }

            generateNewToken();

            return state.currentToken;
        } catch (error) {
            throw new Error(`Token generation failed: ${error.message}`);
        }
    }

    return {
        getToken,
    };
}

function createAPNSProvider(options) {
    return new Promise(async (resolve, reject) => {
        try {
            const baseURL = options.production
                ? 'https://api.push.apple.com'
                : 'https://api.development.push.apple.com';

            const connection = await createAPNSConnection(baseURL);

            const tokenManager = createTokenManager(
                options.token.keyId,
                options.token.teamId,
                options.token.key,
            );

            const getErrorReason = (status) => {
                const errorReasons = {
                    400: 'Bad request',
                    403: 'Invalid certificate or token',
                    404: 'Invalid device token',
                    410: 'Device token is no longer active',
                    413: 'Notification payload too large',
                    429: 'Too many requests',
                    500: 'Internal server error',
                    503: 'Service unavailable',
                };
                return errorReasons[status] || 'Unknown error';
            };

            const send = async (notification, deviceToken) => {
                try {
                    const token = tokenManager.getToken();
                    const headers = {
                        ':method': 'POST',
                        ':scheme': 'https',
                        ':path': `/3/device/${deviceToken}`,
                        authorization: `bearer ${token}`,
                        'apns-topic': notification.topic,
                        'apns-expiration': notification.expiry.toString(),
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    };

                    const payload = {
                        aps: {
                            alert: notification.alert,
                            badge: notification.badge,
                            sound: notification.sound,
                            'interruption-level': notification['interruption-level'],
                        },
                        ...notification.payload,
                    };

                    return new Promise((resolve, reject) => {
                        const client = connection.getClient();

                        if (!client) {
                            reject(new Error('No active HTTP/2 connection'));
                            return;
                        }

                        const req = client.request(headers);
                        let responseData = '';

                        req.on('response', (headers) => {
                            const status = headers[':status'];
                            if (status === 200) {
                                resolve({
                                    sent: [
                                        {
                                            device: deviceToken,
                                            status: 'success',
                                        },
                                    ],
                                    failed: [],
                                });
                            } else {
                                reject({
                                    sent: [],
                                    failed: [
                                        {
                                            device: deviceToken,
                                            status: 'error',
                                            response: {
                                                reason: getErrorReason(status),
                                                statusCode: status,
                                                error: responseData,
                                            },
                                        },
                                    ],
                                });
                            }
                        });

                        req.on('data', (chunk) => {
                            responseData += chunk;
                        });

                        req.on('error', (err) => {
                            reject({
                                sent: [],
                                failed: [
                                    {
                                        device: deviceToken,
                                        status: 'error',
                                        response: {
                                            reason: 'Request failed',
                                            error: err.message,
                                        },
                                    },
                                ],
                            });
                        });

                        req.write(JSON.stringify(payload));
                        req.end();
                    });
                } catch (error) {
                    throw {
                        sent: [],
                        failed: [
                            {
                                device: deviceToken,
                                status: 'error',
                                response: {
                                    reason: 'Internal error',
                                    error: error.message,
                                },
                            },
                        ],
                    };
                }
            };

            resolve({
                send,
                close: connection.close,
                reconnect: connection.reconnect,
            });
        } catch (error) {
            console.error(error);
            return reject(error);
        }
    });
}

function getAPNSProvider(options) {
    return new Promise(async (resolve, reject) => {
        if (!provider) {
            try {
                provider = await createAPNSProvider(options);
            } catch (e) {
                console.error(e);
                return reject();
            }
        }

        resolve(provider);
    });
}

function sendIOSBatch(devicesTokensPayloads, time_sensitive) {
    return new Promise(async (resolve, reject) => {
        const options = {
            token: {
                key: sanitizePrivateKey(process.env.APPLE_PRIVATE_KEY),
                keyId: process.env.APPLE_KEY_ID,
                teamId: process.env.APPLE_TEAM_ID,
            },
            production: false,
        };

        try {
            let t = timeNow();

            const apnProvider = await getAPNSProvider(options);

            console.log({
                apnProvider: timeNow() - t,
            });

            let notifications_ps = [];

            let deviceTokens = Object.keys(devicesTokensPayloads);

            for (let device_token of deviceTokens) {
                let payloadData = devicesTokensPayloads[device_token];

                let notifyData = {
                    topic: process.env.APPLE_APP_ID,
                    expiry: Math.floor(Date.now() / 1000) + 3600,
                    sound: 'ping.aiff',
                    alert: {
                        title: payloadData.title,
                        body: payloadData.body,
                    },
                    payload: payloadData.data || {},
                };

                if (time_sensitive) {
                    notifyData['interruption-level'] = 'time-sensitive';
                }

                notifications_ps.push(apnProvider.send(notifyData, device_token));
            }

            let results = await Promise.allSettled(notifications_ps);

            //process results, both fulfilled and rejected promises
            results = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }

                return {
                    sent: [],
                    failed: [
                        {
                            device: deviceTokens[index],
                            status: 'error',
                            response: {
                                reason: 'Send failed',
                                error: result.reason.message || 'Unknown error',
                            },
                        },
                    ],
                };
            });

            resolve(results);
        } catch (error) {
            console.error(error);
            return reject();
        }
    });
}

module.exports = {
    notifyMatches,
    sendNewNotifications,
    getPayload,
    getPersonNotifications,
    acceptNotification,
    declineNotification,
    ios: {
        sendBatch: sendIOSBatch,
    },
};
