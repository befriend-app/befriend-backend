const axios = require('axios');
const http2 = require('http2');
const jwt = require('jsonwebtoken');

const { timeNow, generateToken, getURL } = require('./shared');

const activitiesService = require('./activities');
const cacheService = require('./cache');
const dbService = require('./db');
const { getNetworkSelf, getNetworksLookup, getSecretKeyToForNetwork, getNetwork } = require('./network');


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


function getPayload(activity_network, me, activity, notification_activity) {
    let title_arr = [];
    let plus_str = '';
    let emoji_str = '';
    let time_str = activity?.when.time.formatted || notification_activity?.human_time;
    let place_str = '';

    let friends_qty = activity?.friends.qty || notification_activity?.persons_qty;

    if (friends_qty > 1) {
        plus_str = ` (+${friends_qty - 1})`;
    }

    let place_name = activity?.place.data.name || notification_activity?.location_name;

    if (place_name) {
        place_str = `at ${place_name}`;
    }

    let is_address = activity?.place.is_address || false;

    if (is_address) {
        //
    } else {
        let emoji = activity?.activity.data.activity_emoji || notification_activity?.activityType.activity_emoji;

        if (emoji) {
            emoji_str = emoji + ' ';
        }

        let activityTypeName = activity?.activity.name || notification_activity?.activityType.notification_name;

        if (activityTypeName) {
            title_arr.push(activityTypeName);
        }

        title_arr.push(`at ${time_str}`);
    }

    return {
        title: `${emoji_str}Invite: ${title_arr.join(' ')}`,
        body: `Join ${me.first_name}${plus_str} ${place_str}`,
        data: {
            activity_token: activity?.activity_token || notification_activity?.activity_token,
            network_token: activity_network.network_token,
        },
    };
}

function notifyMatches(me, activity, matches) {
    let isFulfilled = false;

    let conn, payload, my_network, networksLookup;

    let notifications_cache_key = cacheService.keys.activities_notifications(activity.activity_token);

    let activityCopy = structuredClone(activity);

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

            if(!has_device) {
                // 3rd party network
                let prevent_duplicates = {};

                for(let network of to_person.networks) {
                    if(!prevent_duplicates[network]) {
                        prevent_duplicates[network] = {};
                    }

                    if(!notify_networks_persons[network]) {
                        notify_networks_persons[network] = [];
                    }

                    if(!prevent_duplicates[network][to_person.person_token]) {
                        prevent_duplicates[network][to_person.person_token] = true;
                        notify_networks_persons[network].push(to_person);
                    }
                }
            }
        }

        return {
            platforms,
            notify_networks_persons
        }
    }

    function sendGroupNotifications(group, delay) {
        setTimeout(async function () {
            //check if activity has already been fulfilled
            if (isFulfilled) {
                return;
            }

            let spots = {
                available: activity.friends.qty,
                accepted: activity.friends.qty
            }

            if (delay > 0) {
                try {
                    spots = await activitiesService.getActivitySpots(activity.activity_token);
                } catch(e) {
                    console.error(e);
                    return;
                }

                if (spots.available <= 0) {
                    isFulfilled = true;
                    return;
                }
            }

            activityCopy.spots = spots;

            let {platforms, notify_networks_persons} = organizeGroupSend(group, payload);

            //send notifications
            if (Object.keys(platforms.ios.tokens).length) {
                try {
                    await iosSendGroup(platforms.ios);
                } catch(e) {
                    console.error(e);
                }
            }

            if (Object.keys(platforms.android.tokens).length) {
                try {
                    await androidSendGroup(platforms.android);
                } catch(e) {
                    console.error(e);
                }
            }

            if(Object.keys(notify_networks_persons).length) {
                try {
                    await networksSendGroup(notify_networks_persons);
                } catch(e) {
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
                let pipeline = cacheService.startPipeline();

                let results = await sendIOSBatch(
                    ios.tokens,
                    true,
                );

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

                    for (let i = 0; i < batch_insert.length; i++) {
                        let insert = batch_insert[i];
                        let to_person = to_persons[i];

                        insert.person_from_token = me.person_token;
                        insert.friends_qty = activity.friends.qty;

                        pipeline.hSet(
                            notifications_cache_key,
                            to_person.person_token,
                            JSON.stringify(insert)
                        );

                        let person_notifications_cache_key = cacheService.keys.persons_notifications(to_person.person_to_token);

                        pipeline.hSet(
                            person_notifications_cache_key,
                            activity.activity_token,
                            JSON.stringify(insert)
                        );
                    }

                    await cacheService.execPipeline(pipeline);
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

                for(let network_token in notify_networks_persons) {
                    let network = networksLookup.byToken[network_token];

                    if(!network) {
                        continue;
                    }

                    let secret_key_to = await getSecretKeyToForNetwork(network.id);

                    if (!secret_key_to) {
                        continue;
                    }

                    let network_persons = notify_networks_persons[network_token];

                    let organized = {};

                    let batch_insert = [];

                    for(let network_person of network_persons) {
                        //in case person belongs to multiple networks and we already delivered a notification request to a network
                        if(persons_networks[network_person.person_token]) {
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
                            updated: timeNow()
                        };

                        batch_insert.push(data);

                        organized[network_person.person_token] = {
                            access_token: data.access_token,
                            person_from_first_name: me.first_name || null,
                            person_from_token: me.person_token,
                            person_to_token: network_person.person_token,
                            sent_to_network_at: data.sent_to_network_at,
                            updated: data.updated
                        };
                    }

                    if(batch_insert.length) {
                        let organized_person_tokens = Object.keys(organized);

                        // (1) add to db
                        await dbService.batchInsert('activities_notifications', batch_insert, true);

                        // (2) add to cache
                        let pipeline = cacheService.startPipeline();

                        for(let i = 0; i < batch_insert.length; i++) {
                            let insert = batch_insert[i];
                            let to_person = organized[organized_person_tokens[i]];

                            insert.person_from_token = me.person_token;
                            insert.friends_qty = activity.friends.qty;

                            pipeline.hSet(
                                notifications_cache_key,
                                to_person.person_to_token,
                                JSON.stringify(insert)
                            );

                            let person_notifications_cache_key = cacheService.keys.persons_notifications(to_person.person_to_token);

                            pipeline.hSet(
                                person_notifications_cache_key,
                                activity.activity_token,
                                JSON.stringify(insert)
                            );
                        }

                        await cacheService.execPipeline(pipeline);

                        // (3) post to network
                        try {
                            let url = getURL(network.api_domain, 'networks/activities/notifications');

                            let r = await axios.post(url, {
                                secret_key: secret_key_to,
                                network_token: my_network.network_token,
                                person_from_token: me.person_token,
                                activity: activityCopy,
                                persons: organized,
                                spots
                            }, {
                                timeout: 2000
                            });

                            let activity_notification_ids = batch_insert.map(item => item.id);

                            await conn('activities_notifications')
                                .whereIn('id', activity_notification_ids)
                                .update({
                                    did_network_receive: r.status === 201,
                                    updated: timeNow(),
                                });

                            if(r.status === 201) {
                                for(let person_token in organized) {
                                    persons_networks[person_token] = true;
                                }
                            }
                        } catch(e) {
                            console.error(e);
                        }
                    }
                }

                resolve();
            } catch(e) {
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
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        //organize matches into sending groups
        //stagger sending

        let groups_organized = {};
        let group_keys = Object.keys(notification_groups);
        let persons_multiplier = Math.max(activity?.friends?.qty, 1);

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

function acceptNotification(person, activity_token) {
    return new Promise(async (resolve, reject) => {
        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_activity_cache_key = cacheService.keys.persons_activities(person.person_token);
        let person_notification_cache_key = cacheService.keys.persons_notifications(person.person_token);

        try {
            //ensure person exists on activity invite
            let notifications = await cacheService.hGetAllObj(notification_cache_key);

            let notification = notifications?.[person.person_token];

            if (!notification) {
                return reject('Activity does not include person');
            }

            if (notification.declined_at) {
                return reject('Activity cannot be accepted');
            }

            if (notification.accepted_at) {
                return reject('Activity already accepted');
            }

            let spots = await activitiesService.getActivitySpots(activity_token, notifications);

            if (spots.available <= 0) {
                return resolve({
                    error: 'Unavailable: max spots reached'
                });
            }

            let conn = await dbService.conn();

            let network_self = await getNetworkSelf();

            let time = timeNow();

            let activity_qry = await conn('activities')
                .where('activity_token', activity_token)
                .select('id', 'activity_start', 'activity_end')
                .first();

            if(!activity_qry) {
                return reject('Activity not found');
            }

            let update = {
                accepted_at: time,
                updated: time,
            };

            notification = {
                ...notification,
                ...update,
            };

            let pipeline = cacheService.startPipeline();

            pipeline.hSet(notification_cache_key, person.person_token, JSON.stringify(notification));
            pipeline.hSet(person_notification_cache_key, activity_token, JSON.stringify(notification));

            await cacheService.execPipeline(pipeline);

            await conn('activities')
                .where('id', notification.activity_id)
                .update({
                    spots_available: spots.available,
                    updated: timeNow()
                });

            await conn('activities_notifications').where('id', notification.id).update(update);

            //add to own activities list
            let person_activity_insert = {
                activity_id: notification.activity_id,
                person_id: person.id,
                is_creator: false,
                created: time,
                updated: time
            };

            let person_activity_id = await conn('activities_persons')
                .insert(person_activity_insert);

            person_activity_id = person_activity_id[0];
            person_activity_insert.id = person_activity_id;
            person_activity_insert.person_from_token = notification.person_from_token;

            person_activity_insert = {
                ...person_activity_insert,
                activity_start: activity_qry.activity_start,
                activity_end: activity_qry.activity_end,
            }

            await cacheService.hSet(person_activity_cache_key, activity_token, person_activity_insert);

            spots.accepted++;
            spots.available--;

            //notify 3rd party network of acceptance
            if (network_self.id !== notification.person_to_network_id) {
                try {
                    let network = await getNetwork(notification.person_to_network_id);
                    let secret_key_to = await getSecretKeyToForNetwork(notification.person_to_network_id);

                    if(network && secret_key_to) {
                        try {
                            let url = getURL(network.api_domain, `networks/activities/${activity_token}/notification/accept`);

                            await axios.put(url, {
                                network_token: network_self.network_token,
                                secret_key: secret_key_to,
                                person_token: person.person_token,
                                accepted_at: time
                            });
                        } catch(e) {
                            console.error(e);
                        }
                    }
                } catch(e) {
                    console.error(e);
                }
            }

            let notify_networks = {};
            let networksLookup;

            //send current spots data to notified persons via ws
            for(let _person_token in notifications) {
                let data = notifications[_person_token];

                //notify person via websocket if they're on my network
                if(data.person_to_network_id === network_self.id) {
                    if(_person_token !== person.person_token) { //skip self
                        cacheService.publish('notifications', _person_token, {
                            activity_token,
                            spots
                        });
                    }
                } else { //organize 3rd-party networks
                    if(!networksLookup) {
                        networksLookup = await getNetworksLookup();

                        let network_to = networksLookup.byId[data.person_to_network_id];

                        if(!network_to) {
                            continue;
                        }

                        if(!notify_networks[network_to.network_token]) {
                            notify_networks[network_to.network_token] = network_to;
                        }
                    }
                }
            }

            //send spots to 3rd-party networks
            try {
                let ps = [];

                for(let network_token in notify_networks) {
                    let network_to = notify_networks[network_token];

                    let secret_key_to = await getSecretKeyToForNetwork(network_to.id);

                    if(secret_key_to) {
                        try {
                            let url = getURL(network_to.api_domain, `/networks/activities/${activity_token}/notification/spots`);

                            ps.push(axios.put(url, {
                                network_token: network_self.network_token,
                                secret_key: secret_key_to,
                                spots
                            }));
                        } catch(e) {
                            console.error(e);
                        }
                    }
                }

                if(ps.length) {
                    await Promise.allSettled(ps);
                }
            } catch(e) {
                console.error(e);
            }

            resolve({
                success: true,
                message: 'Notification accepted successfully',
                spots
            });
        } catch(e) {
            console.error(e);
            return reject("Error accepting activity")
        }
    });
}

function declineNotification(person, activity_token) {
    return new Promise(async (resolve, reject) => {
        let notification_cache_key = cacheService.keys.activities_notifications(activity_token);
        let person_notification_cache_key = cacheService.keys.persons_notifications(person.person_token);

        try {
            //ensure person exists on activity invite
            let notification = await cacheService.hGetItem(notification_cache_key, person.person_token);

            if (!notification) {
                return reject('Activity does not include person');
            }

            if (notification.accepted_at) {
                return reject('Activity cannot be declined');
            }

            if (notification.declined_at) {
                return reject('Activity already declined');
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

            pipeline.hSet(notification_cache_key, person.person_token, JSON.stringify(notification));
            pipeline.hSet(person_notification_cache_key, activity_token, JSON.stringify(notification));

            await cacheService.execPipeline(pipeline);

            await conn('activities_notifications').where('id', notification.id).update(update);

            //3rd-party network
            if (network_self.id !== notification.person_to_network_id) {
                //notify network of decline
                let network = await getNetwork(notification.person_to_network_id);
                let secret_key_to = await getSecretKeyToForNetwork(notification.person_to_network_id);

                if(network && secret_key_to) {
                    try {
                        let url = getURL(network.api_domain, `networks/activities/${activity_token}/notification/decline`);

                        await axios.put(url, {
                            network_token: network_self.network_token,
                            secret_key: secret_key_to,
                            person_token: person.person_token,
                            declined_at: time
                        });
                    } catch(e) {
                        console.error(e);
                    }
                }
            }

            resolve({
                success: true,
                message: 'Notification declined successfully',
            });
        } catch(e) {
            console.error(e);
            return reject("Error declining activity")
        }
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
                key: process.env.APPLE_PRIVATE_KEY,
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

            for(let device_token of deviceTokens) {
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
                }

                if (time_sensitive) {
                    notifyData['interruption-level'] = 'time-sensitive';
                }

                notifications_ps.push(apnProvider.send(notifyData, device_token));
            }

            let results = await Promise.allSettled(notifications_ps);

            // Process results to handle both fulfilled and rejected promises

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
    getPayload,
    acceptNotification,
    declineNotification,
    ios: {
        sendBatch: sendIOSBatch,
    },
};
