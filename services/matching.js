const axios = require('axios');
const matchingThreadPool = require('./matching/matching-thread-pool');

const activitiesService = require('./activities');
let cacheService = require('./cache');
let dbService = require('./db');

const {
    interestScoreThresholds,
    organizePersonInterests,
    calculateTotalScore,
} = require('./matching/matching-helpers');

const {
    getInterestSections,
    getSchoolsWorkSections,
    getPersonalSections,
} = require('./filters');

const { timeNow, getURL } = require('./shared');
const { getNetworksLookup, getNetworkSelf, getSecretKeyToForNetwork } = require('./network');

const { getPayload } = require('./notifications');

const MAX_PERSONS_PROCESS = 1000;
const NOTIFICATION_MINS_BUFFER = 5;

let interests_sections = getInterestSections();
let schools_work_sections = getSchoolsWorkSections();
let personal_sections = getPersonalSections();

let debug_recent_notifications = require('../dev/debug').notifications.recent;


function getMatchesServer(person, params = {}, custom_filters = null, initial_person_tokens = []) {
    return new Promise(async (resolve, reject) => {
        try {
            let port = require('../servers/ports').matching;

            let r = await axios.put(`http://localhost:${port}/matches`, {
                person, params, custom_filters, initial_person_tokens
            });

            resolve(r.data);
        } catch(e) {
            console.error(e);
            return reject(e.response?.data?.error);
        }
    });
}

function getMatches(me, params = {}, custom_filters = null, initial_person_tokens = []) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!me) {
                return reject('Person required');
            }

            if (!threadPool.isInitialized()) {
                await threadPool.initialize();
            }

            //matching computations performed in worker thread
            let result = await threadPool.runMatching(me, params, custom_filters, initial_person_tokens);

            resolve(result);
        } catch (error) {
            console.error('Error in getMatches:', error);
            reject(error);
        }
    });
}

/**
 * After initial matching, filter out matches by:
 * - 3rd-party networks
 * - Current activities
 * - Recent notifications
 * - Previous notifications for the same activity
 * - Activity type exclusions
 * - Device information
 */

function filterMatches(person, activity, matches, on_send_new = false) {
    let debugFilterMatchesEnabled = require('../dev/debug').matching.filter_matches;
    let debugActivityOverlapEnabled = require('../dev/debug').matching.activity_overlap;

    let filtered_matches = [];
    let organized_matches = new Map();
    let filter_networks_persons = new Map();
    let persons_excluded = new Set();



    let conn, payload, my_network, networksLookup;

    //for development/testing
    let _tmp_person_int = 0;
    let _tmp_device_int = 0;

    function organizeMatches() {
        return new Promise(async (resolve, reject) => {
            for (let match of matches) {
                //do not add to organized matches if excluded
                if (persons_excluded.has(match.person_token)) {
                    continue;
                }

                let match_networks = [];

                for (let network_token of match.networks || []) {
                    let matchNetwork = networksLookup.byToken[network_token];

                    if (matchNetwork) {
                        match_networks.push(matchNetwork);
                    }
                }

                if (!match_networks.length) {
                    continue;
                }

                if (match.networks.includes(my_network.network_token)) {
                    if (match.device?.platform && match.device.token) {
                        organized_matches.set(match.person_token, match);
                    }
                } else {
                    //3rd-party network
                    //use first network
                    let network = match_networks[0];

                    //do not add if network is offline
                    if (!network.is_online) {
                        continue;
                    }

                    //we will call each network with matching person tokens to find which should be excluded
                    if (!filter_networks_persons.has(network.network_token)) {
                        filter_networks_persons.set(network.network_token, new Set());
                    }

                    filter_networks_persons.get(network.network_token).add(match.person_token);

                    organized_matches.set(match.person_token, match);
                }
            }

            resolve();
        });
    }

    function excludeNetworksPersons() {
        return new Promise(async (resolve, reject) => {
            if (!filter_networks_persons.size) {
                return resolve();
            }

            let ps = [];

            for (let [network_token, person_tokens] of filter_networks_persons) {
                try {
                    let network = networksLookup.byToken[network_token];

                    let url = getURL(network.api_domain, `/networks/activities/matching/exclude`);

                    let secret_key = await getSecretKeyToForNetwork(network.id);

                    let arr_person_tokens = Array.from(person_tokens);

                    if (person_tokens.size > MAX_PERSONS_PROCESS) {
                        arr_person_tokens = arr_person_tokens.slice(0, MAX_PERSONS_PROCESS);
                    }

                    let lat = activity.place?.data?.location_lat || activity.location_lat;
                    let lon = activity.place?.data?.location_lon || activity.location_lon;

                    ps.push(
                        axios.put(url, {
                            network_token: my_network.network_token,
                            person: {
                                person_token: person.person_token,
                                grid: {
                                    token: person.grid?.token,
                                },
                            },
                            secret_key,
                            activity_location: {
                                lat,
                                lon,
                            },
                            person_tokens: arr_person_tokens,
                        }),
                    );
                } catch (e) {
                    console.error(e);
                }
            }

            try {
                //call networks in parallel
                let results = await Promise.allSettled(ps);

                let filter_idx = 0;

                for (let [network_token, person_tokens] of filter_networks_persons) {
                    let result = results[filter_idx++];

                    let exclude_person_tokens = result.value?.data?.excluded ?? [];

                    if (exclude_person_tokens.length) {
                        for (let person_token of exclude_person_tokens) {
                            //remove excluded person tokens
                            organized_matches.delete(person_token);
                        }
                    }
                }
            } catch (e) {
                console.error(e);
            }

            return resolve();
        });
    }

    function excludeRecentNotifications(personNotifications) {
        if (debug_recent_notifications) {
            return false;
        }

        let most_recent_notification = null;

        for (let k in personNotifications) {
            let personNotification = personNotifications[k];

            if (personNotification.declined_at) {
                continue;
            }

            let time_sent = personNotification.sent_at || personNotification.sent_to_network_at;

            if (!time_sent) {
                continue;
            }

            personNotification.time_sent = time_sent;

            if (
                !most_recent_notification ||
                timeNow() - time_sent < timeNow() - most_recent_notification.time_sent
            ) {
                most_recent_notification = personNotification;
            }
        }

        if (most_recent_notification) {
            let sent_secs_ago = (timeNow() - most_recent_notification.time_sent) / 1000;

            return sent_secs_ago < NOTIFICATION_MINS_BUFFER * 60;
        }

        return false;
    }

    async function getTmpPerson() {
        let conn = await dbService.conn();

        let offset_from = on_send_new ? 2 : 1;

        let persons = await conn('persons AS p')
            .join('networks AS n', 'n.id', '=', 'p.registration_network_id')
            .orderBy('p.id')
            .offset(offset_from)
            .limit(require('../dev/debug').matching.send_count)
            .select('p.*', 'n.network_token');

        let person = persons[_tmp_person_int];

        person.networks = [person.network_token];

        _tmp_person_int++;

        if (_tmp_person_int >= persons.length) {
            _tmp_person_int = 0;
        }

        return person;
    }

    async function getTmpDevice() {
        let conn = await dbService.conn();

        let devices = await conn('persons_devices')
            .orderBy('person_id')
            .offset(1)
            .limit(require('../dev/debug').matching.send_count);

        let device = devices[_tmp_device_int];

        _tmp_device_int++;

        if (_tmp_device_int >= devices.length) {
            _tmp_device_int = 0;
        }

        return device;
    }

    return new Promise(async (resolve, reject) => {
        let prev_notifications_persons = {};

        try {
            conn = await dbService.conn();

            my_network = await getNetworkSelf();
            networksLookup = await getNetworksLookup();

            payload = getPayload(my_network, person, activity);
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        //get networks and devices for matches
        let pipeline = cacheService.startPipeline();
        let results = [];
        let idx = 0;

        for (let match of matches) {
            pipeline.hmGet(cacheService.keys.person(match.person_token), [
                'id',
                'networks',
                'devices',
            ]);

            //current activities
            pipeline.hGetAll(cacheService.keys.persons_activities(match.person_token));

            //all notifications
            pipeline.hGetAll(cacheService.keys.persons_notifications(match.person_token));

            //activity types filter
            pipeline.hGet(cacheService.keys.person_filters(match.person_token), 'activity_types');
        }

        try {
            results = await cacheService.execPipeline(pipeline);
        } catch (e) {
            console.error(e);
        }

        let activity_notification_key = cacheService.keys.activities_notifications(
            activity.activity_token,
        );

        try {
            prev_notifications_persons =
                (await cacheService.hGetAllObj(activity_notification_key)) || {};
        } catch (e) {
            console.error(e);
        }

        for (let match of matches) {
            try {
                let personData = results[idx++];
                let personActivities = cacheService.parseHashData(results[idx++]);
                let personNotifications = cacheService.parseHashData(results[idx++]);
                let activitiesFilter = JSON.parse(results[idx++]);

                //exclude if notifications already sent for this activity
                if (match.person_token in prev_notifications_persons) {
                    persons_excluded.add(match.person_token);
                    continue;
                }

                match.person_id = parseInt(personData[0]);
                match.networks = JSON.parse(personData[1]) || [];
                let personDevices = JSON.parse(personData[2]);

                if (!match.networks.length) {
                    console.warn({
                        person_token: match.person_token,
                        error: 'missing cached networks field',
                    });

                    persons_excluded.add(match.person_token);
                    continue;
                }

                //exclude if this activity overlaps with existing activities
                if (Object.keys(personActivities).length && !debugFilterMatchesEnabled) {
                    const activityStart = activity.when?.data?.start;
                    const activityEnd = activity.when?.data?.end;

                    let activity_overlaps = await activitiesService.doesActivityOverlap(
                        person.person_token,
                        {
                            start: activityStart,
                            end: activityEnd,
                        },
                        personActivities,
                    );

                    if (activity_overlaps && !debugActivityOverlapEnabled) {
                        persons_excluded.add(match.person_token);
                        continue;
                    }
                }

                //exclude by recent notifications
                if (Object.keys(personNotifications).length) {
                    let exclude_recent = excludeRecentNotifications(personNotifications);

                    if (exclude_recent) {
                        persons_excluded.add(match.person_token);
                        continue;
                    }
                }

                //exclude by activity type
                let is_activity_excluded = activitiesService.isActivityTypeExcluded(
                    activity,
                    activitiesFilter,
                );

                if (is_activity_excluded) {
                    persons_excluded.add(match.person_token);
                    continue;
                }

                if (!personDevices?.length) {
                    continue;
                }

                let currentDevice = personDevices?.find((device) => device.is_current);

                if (!currentDevice) {
                    currentDevice = personDevices[0];
                }

                if (currentDevice) {
                    match.device = {
                        platform: currentDevice.platform,
                        token: currentDevice.token,
                    };
                }
            } catch (e) {
                console.error(e);
            }
        }

        //organize by this network/3rd party networks
        await organizeMatches();

        //exclude by data known to 3rd party networks only
        await excludeNetworksPersons();

        //prepare return data
        for (let [person_token, match] of organized_matches) {
            filtered_matches.push(match);
        }

        if (debugFilterMatchesEnabled) {
            let splice_from = on_send_new ? 1 : 0;

            filtered_matches = filtered_matches.splice(
                splice_from,
                require('../dev/debug').matching.send_count,
            );

            for (let match of filtered_matches) {
                let data = await getTmpPerson();

                match.networks = data.networks;
                match.person_id = data.id;
                match.person_token = data.person_token;

                let device = await getTmpDevice();

                if (match.networks.includes(my_network.network_token)) {
                    match.device = device;
                }
            }
        }

        if (!filtered_matches.length) {
            return reject({
                message: 'No persons available to notify',
            });
        }

        resolve(filtered_matches);
    });
}

function personToPersonInterests(person_1, person_2) {
    return new Promise(async (resolve, reject) => {
        let personsInterests = {
            person_1: {
                sections: {},
                filters: {},
            },
            person_2: {
                sections: {},
                filters: {},
                matches: {
                    items: {},
                    count: 0,
                    total_score: 0,
                },
            },
        };

        try {
            let person_tokens = [person_1.person_token, person_2.person_token];
            let pipeline = cacheService.startPipeline();

            let sections = interests_sections
                .concat(schools_work_sections)
                .concat(personal_sections);

            for (let person_token of person_tokens) {
                let person_section_key = cacheService.keys.person_sections(person_token);
                let person_filters_key = cacheService.keys.person_filters(person_token);

                for (let section of sections) {
                    pipeline.hGet(person_section_key, section.token);
                    pipeline.hGet(person_filters_key, section.token);
                }
            }

            let results = await cacheService.execPipeline(pipeline);

            let idx = 0;

            for (let i = 1; i <= 2; i++) {
                for (let section of sections) {
                    try {
                        personsInterests[`person_${i}`].sections[section.token] = JSON.parse(
                            results[idx++],
                        );
                        personsInterests[`person_${i}`].filters[section.token] = JSON.parse(
                            results[idx++],
                        );
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            organizePersonInterests(sections, personsInterests.person_1, personsInterests.person_2);

            personsInterests.person_2.matches.total_score = calculateTotalScore(
                Object.values(personsInterests.person_2.matches.items),
            );
            personsInterests.person_2.matches.count = Object.keys(
                personsInterests.person_2.matches.items,
            ).length;
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve({
            ...personsInterests.person_2.matches,
            thresholds: interestScoreThresholds,
        });
    });
}

const threadPool = matchingThreadPool();

async function shutdown() {
    return threadPool.shutdown();
}

module.exports = {
    getMatches,
    getMatchesServer,
    filterMatches,
    personToPersonInterests,
};

//shutdown worker threads
process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
});
