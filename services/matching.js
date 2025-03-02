const axios = require('axios');

const activitiesService = require('./activities');
let cacheService = require('../services/cache');
let dbService = require('../services/db');

let gridService = require('../services/grid');
let reviewService = require('../services/reviews');
let sectionsData = require('../services/sections_data');

const {
    getPersonFilters,
    getInterestSections,
    getSchoolsWorkSections,
    getPersonalSections,
} = require('./filters');

const { kms_per_mile, timeNow, isNumeric, calculateDistanceMeters, getURL } = require('./shared');
const { getNetworksLookup, getNetworkSelf, getSecretKeyToForNetwork } = require('./network');
const { getModes, getPersonExcludedModes } = require('./modes');
const { getGendersLookup } = require('./genders');
const { getDrinking } = require('./drinking');
const { getSmoking } = require('./smoking');
const { getLifeStages } = require('./life_stages');
const { getRelationshipStatus } = require('./relationships');
const { getPolitics } = require('./politics');
const { getReligions } = require('./religion');
const { isPersonAvailable } = require('./availability');
const { minAge, maxAge } = require('./persons');
const { getActivityPlace } = require('./places');
const { getLanguages } = require('./languages');

const { getPayload } = require('./notifications');
const { getGridById } = require('./grid');

const DEFAULT_DISTANCE_MILES = 20;
const MAX_PERSONS_PROCESS = 1000;
const NOTIFICATION_MINS_BUFFER = 5;

let interests_sections = getInterestSections();
let schools_work_sections = getSchoolsWorkSections();
let personal_sections = getPersonalSections();

let interestScoreThresholds = {
    ultra: 200,
    super: 100,
};

let { skipDebugFilter } = require('../dev/debug').matching;
let debug_logs = require('../dev/debug').matching.logs;
let debug_recent_notifications = require('../dev/debug').notifications.recent;


function getMatches(me, params = {}, custom_filters = null, initial_person_tokens = []) {
    function skipFilter(filter_name) {
        if (custom_filters && !custom_filters.includes(filter_name)) {
            return true;
        }

        return skipDebugFilter(filter_name);
    }

    let { activity, location, send_only, counts_only, exclude_only } = params;

    let my_token, my_filters, activity_location;
    let am_online = me?.is_online;
    let am_available = false;

    let neighbor_grid_tokens = new Set();
    let person_tokens = new Set();

    if (initial_person_tokens.length) {
        initial_person_tokens.map((person_token) => person_tokens.add(person_token));
    }

    let personsInterests = new Map();

    let personsExclude = {
        send: new Set(),
        receive: new Set(),
    };

    let persons_not_excluded_after_stage_1 = new Set();

    let persons_not_excluded_final = new Set();

    let organized = {
        counts: {
            send: 0,
            receive: 0,
            interests: {
                total: 0,
                ultra: 0,
                super: 0,
                regular: 0,
            },
            excluded: 0,
        },
        matches: {
            send: [],
            receive: [],
        },
    };

    function setActivityLocation() {
        return new Promise(async (resolve, reject) => {
            let lat = null,
                lon = null;

            if (location?.lat && location.lon) {
                lat = location.lat;
                lon = location.lon;
            } else if (activity?.place) {
                // use activity place lat/lon
                if (activity.place?.data?.location_lat) {
                    lat = activity.place.data.location_lat;
                    lon = activity.place.data.location_lon;
                } else {
                    try {
                        let place = await getActivityPlace(activity);

                        activity.place.data = place;

                        lat = place.location_lat;
                        lon = place.location_lon;
                    } catch (e) {
                        console.error(e);
                    }
                }
            } else if (activity?.location_lat && activity.location_lon) {
                lat = activity.location_lat;
                lon = activity.location_lon;
            }

            if (lat && lon) {
                activity_location = {
                    lat,
                    lon,
                };
            }

            resolve();
        });
    }

    function sortMatches() {
        organized.matches.send.sort(function (a, b) {
            if (b.matches.total_score !== a.matches.total_score) {
                return b.matches.total_score - a.matches.total_score;
            }

            return b.matches.count - a.matches.count;
        });
    }

    function processStage1() {
        return new Promise(async (resolve, reject) => {
            try {
                let t = timeNow();

                await getGridTokens();

                if (debug_logs) {
                    console.log({
                        time_grid_tokens: timeNow() - t,
                    });
                }

                t = timeNow();

                await getGridPersonTokens();

                if (debug_logs) {
                    console.log({
                        total_initial_persons: person_tokens.size,
                    });

                    console.log({
                        time_person_tokens: timeNow() - t,
                    });
                }

                await filterOnlineStatus();

                await filterModes();

                await filterVerifications();

                await filterGenders();

                await filterSection('life_stages', getLifeStages, true);

                await filterSection('relationships', getRelationshipStatus, true);

                await filterSection('languages', getLanguages, true);

                await filterSection('politics', getPolitics, false);

                await filterSection('religion', getReligions, true);

                await filterSection('drinking', getDrinking, false);

                await filterSection('smoking', getSmoking, false);

                return resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function filterPersonsAfterStage1() {
        for (let person_token of person_tokens) {
            let included = false;

            if (!personsExclude.send.has(person_token)) {
                included = true;
            }

            //if I'm offline or unavailable, exclude receiving from all
            if (!am_online || !am_available) {
                if (!send_only) {
                    personsExclude.receive.add(person_token);
                }
            } else {
                //allow receiving notifications if not excluded
                if (!personsExclude.receive.has(person_token)) {
                    included = true;
                }
            }

            if (included) {
                persons_not_excluded_after_stage_1.add(person_token);
            } else {
                organized.counts.excluded++;
            }
        }
    }

    function processStage2() {
        return new Promise(async (resolve, reject) => {
            try {
                let t = timeNow();

                await filterNetworks();

                await filterDistance();

                await filterAges();

                await filterReviews();

                await filterPersonsAvailability();
            } catch (e) {
                console.error(e);
            }

            resolve();
        });
    }

    function matchInterests() {
        // priority
        // (1) bi-directional filter + item match
        // (2) bi-directional filter match
        // (3) bi-directional item match
        // (4) my filter->their item match
        // (5) their filter->my item match

        // multipliers
        // (a) favorite position/is_favorite
        // (b) filter importance
        // (c) secondary match

        let myInterests = {
            filters: {},
            sections: {},
        };

        function calculateInterestScores() {
            for (let [person_token, person] of personsInterests) {
                person.matches.total_score = calculateTotalScore(
                    Object.values(person.matches.items),
                );
                person.matches.count = Object.keys(person.matches.items).length;
            }
        }

        return new Promise(async (resolve, reject) => {
            try {
                //organize my interests
                let sections = interests_sections
                    .concat(schools_work_sections)
                    .concat(personal_sections);

                for (let section of sections) {
                    myInterests.filters[section.token] = my_filters[section.token] || {};
                }

                let my_sections = await cacheService.hGetAllObj(
                    cacheService.keys.person_sections(my_token),
                );

                for (let s in my_sections) {
                    if (s === 'active') {
                        continue;
                    }

                    if (my_sections.active[s] && !my_sections.active[s].deleted) {
                        myInterests.sections[s] = my_sections[s];
                    }
                }

                //filter remaining person tokens for retrieval of person/filter data
                for (let person_token of persons_not_excluded_after_stage_1) {
                    if (
                        personsExclude.send.has(person_token) &&
                        personsExclude.receive.has(person_token)
                    ) {
                        continue;
                    }

                    personsInterests.set(person_token, {
                        person_token,
                        sections: {},
                        filters: {},
                        matches: {
                            items: {},
                            count: 0,
                            total_score: 0,
                        },
                    });
                }

                let pipeline = cacheService.startPipeline();

                for (let [person_token] of personsInterests) {
                    let person_section_key = cacheService.keys.person_sections(person_token);
                    let person_filters_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGetAll(person_section_key);

                    for (let section of sections) {
                        pipeline.hGet(person_filters_key, section.token);
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let t = timeNow();

                for (let [person_token, personInterests] of personsInterests) {
                    //person sections
                    let person_sections = results[idx++];

                    try {
                        person_sections = cacheService.parseHashData(person_sections);

                        for (let s in person_sections) {
                            if (s === 'active') {
                                continue;
                            }

                            if (
                                person_sections?.active?.[s] &&
                                !person_sections.active[s].deleted
                            ) {
                                personInterests.sections[s] = person_sections[s];
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    //person filters
                    for (let section of sections) {
                        try {
                            personInterests.filters[section.token] = JSON.parse(results[idx++]);
                        } catch (e) {
                            console.error(e);
                        }
                    }

                    organizePersonInterests(sections, myInterests, personInterests);
                }

                calculateInterestScores();

                if (debug_logs) {
                    console.log({
                        filter: timeNow() - t,
                    });
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function getGridTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                let my_grid_token = me.grid?.token;

                if (!my_grid_token) {
                    return reject('Grid token required');
                }

                neighbor_grid_tokens.add(my_grid_token);

                // choose location for grid tokens based on if we have a location provided

                // default to user's current location
                let use_location = {
                    lat: me.location_lat,
                    lon: me.location_lon,
                };

                if (activity_location) {
                    use_location.lat = activity_location.lat;
                    use_location.lon = activity_location.lon;
                }

                let max_distance = DEFAULT_DISTANCE_MILES;

                if (my_filters.distance?.is_active && my_filters.distance.filter_value) {
                    if (my_filters.distance.is_send && my_filters.distance.is_receive) {
                        max_distance = my_filters.distance.filter_value;
                    } else if (my_filters.distance.is_send || my_filters.distance.is_receive) {
                        max_distance = Math.max(
                            my_filters.distance.filter_value,
                            DEFAULT_DISTANCE_MILES,
                        );
                    }
                }

                max_distance *= kms_per_mile;

                let grids = await gridService.findNearby(
                    use_location.lat,
                    use_location.lon,
                    max_distance,
                );

                for (let grid of grids) {
                    if (grid.token !== my_grid_token) {
                        neighbor_grid_tokens.add(grid.token);
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function getGridPersonTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                //if custom person tokens provided
                if (person_tokens.size) {
                    return resolve();
                }

                let pipeline_persons = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_persons.sMembers(
                        cacheService.keys.persons_grid_set(grid_token, 'location'),
                    );
                }

                let results_persons = await cacheService.execPipeline(pipeline_persons);

                for (let grid_persons of results_persons) {
                    for (let person_token of grid_persons) {
                        if (person_token !== my_token) {
                            person_tokens.add(person_token);
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    function filterOnlineStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                if (skipFilter('online')) {
                    return resolve();
                }

                let pipeline_offline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_offline.sMembers(
                        cacheService.keys.persons_grid_exclude(grid_token, 'online'),
                    );
                }

                let results_offline = await cacheService.execPipeline(pipeline_offline);

                for (let grid of results_offline) {
                    for (let token of grid) {
                        personsExclude.send.add(token);

                        if (!send_only) {
                            personsExclude.receive.add(token);
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_online_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    function filterNetworks() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('networks')) {
                return resolve();
            }

            try {
                let networksLookup = await getNetworksLookup();

                let my_network_tokens = new Set(me.networks);

                if (!my_network_tokens?.size) {
                    return resolve();
                }

                let networks = Object.values(networksLookup.byId);
                let persons_networks_pipeline = cacheService.startPipeline();
                let persons_excluded_pipeline = cacheService.startPipeline();

                let network_person_tokens = Array.from(persons_not_excluded_after_stage_1);

                for (let person_token of network_person_tokens) {
                    persons_networks_pipeline.hGet(
                        cacheService.keys.person(person_token),
                        'networks',
                    );
                }

                let persons_networks_results =
                    await cacheService.execPipeline(persons_networks_pipeline);

                let networks_persons = new Map();
                let persons_networks = new Map();

                for (let i = 0; i < persons_networks_results.length; i++) {
                    let person_token = network_person_tokens[i];
                    let person_networks_list = JSON.parse(persons_networks_results[i]) || [];

                    persons_networks.set(person_token, new Set(person_networks_list));

                    for (let network_token of person_networks_list) {
                        if (!networks_persons.has(network_token)) {
                            networks_persons.set(network_token, new Set());
                        }
                        networks_persons.get(network_token).add(person_token);
                    }
                }

                // Get exclusion data for each network
                for (let network of networks) {
                    if (my_network_tokens.has(network.network_token)) {
                        continue;
                    }

                    for (let grid_token of neighbor_grid_tokens) {
                        if (!send_only) {
                            persons_excluded_pipeline.sMembers(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `networks:${network.network_token}`,
                                    'send',
                                ),
                            );
                        }

                        persons_excluded_pipeline.sMembers(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `networks:${network.network_token}`,
                                'receive',
                            ),
                        );
                    }
                }

                let excluded_results = await cacheService.execPipeline(persons_excluded_pipeline);
                let idx = 0;
                let networks_persons_exclude = new Map();

                // Process exclusion results
                for (let network of networks) {
                    if (my_network_tokens.has(network.network_token)) {
                        continue;
                    }

                    if (!networks_persons_exclude.has(network.network_token)) {
                        networks_persons_exclude.set(network.network_token, {
                            send: new Set(),
                            receive: new Set(),
                        });
                    }

                    for (let grid_token of neighbor_grid_tokens) {
                        if (!send_only) {
                            let personsExcludeSending = excluded_results[idx++] || [];

                            for (let token of personsExcludeSending) {
                                networks_persons_exclude.get(network.network_token).send.add(token);
                            }
                        }

                        let personsExcludeReceiving = excluded_results[idx++] || [];

                        for (let token of personsExcludeReceiving) {
                            networks_persons_exclude.get(network.network_token).receive.add(token);
                        }
                    }
                }

                let me_networks_exclude = {
                    send: new Set(),
                    receive: new Set(),
                };

                for (let [network_token, data] of networks_persons_exclude) {
                    if (data.send.has(my_token)) {
                        me_networks_exclude.send.add(network_token);
                    }

                    if (data.receive.has(my_token)) {
                        me_networks_exclude.receive.add(network_token);
                    }
                }

                for (let [person_token, person_networks] of persons_networks) {
                    //me sending
                    //bi-directional

                    //exclude sending to this person if all of their networks are excluded by me
                    let their_networks_excluded_by_me = Array.from(person_networks).every(
                        (network_token) => me_networks_exclude.send.has(network_token),
                    );

                    //check if this person has excluded sending to all of my networks
                    let my_networks_excluded_by_them = Array.from(my_network_tokens).every(
                        (network_token) => {
                            if (networks_persons_exclude.has(network_token)) {
                                return networks_persons_exclude
                                    .get(network_token)
                                    .receive.has(person_token);
                            }
                            return false;
                        },
                    );

                    if (their_networks_excluded_by_me || my_networks_excluded_by_them) {
                        personsExclude.send.add(person_token);
                    }

                    //same as above, receiving
                    if (!send_only) {
                        their_networks_excluded_by_me = Array.from(person_networks).every(
                            (network_token) => me_networks_exclude.receive.has(network_token),
                        );

                        my_networks_excluded_by_them = Array.from(my_network_tokens).every(
                            (network_token) => {
                                if (networks_persons_exclude.has(network_token)) {
                                    return networks_persons_exclude
                                        .get(network_token)
                                        .send.has(person_token);
                                }
                                return false;
                            },
                        );

                        if (their_networks_excluded_by_me || my_networks_excluded_by_them) {
                            personsExclude.receive.add(person_token);
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_networks_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterNetworks:', e);
                reject(e);
            }
        });
    }

    function filterModes() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('modes')) {
                return resolve();
            }

            try {
                // Get all modes, not just excluded ones
                let modeTypes = Object.values((await getModes())?.byId);
                let excluded_modes = await getPersonExcludedModes(me, my_filters);

                let included_modes = {
                    send: [],
                    receive: [],
                };

                for (let mode of modeTypes) {
                    if (!excluded_modes.send.has(mode.token)) {
                        included_modes.send.push(mode.token);
                    }

                    if (!excluded_modes.receive.has(mode.token)) {
                        included_modes.receive.push(mode.token);
                    }
                }

                let pipeline = cacheService.startPipeline();

                if (!send_only) {
                    // Check all modes for send
                    for (let mode of modeTypes) {
                        for (let grid_token of neighbor_grid_tokens) {
                            pipeline.sMembers(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `modes:${mode.token}`,
                                    'send',
                                ),
                            );
                        }
                    }
                }

                // Check all modes for receive
                for (let mode of modeTypes) {
                    for (let grid_token of neighbor_grid_tokens) {
                        pipeline.sMembers(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `modes:${mode.token}`,
                                'receive',
                            ),
                        );
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                let personsExcludeModesSend = new Map();
                let personsExcludeModesReceive = new Map();

                // Process send results
                if (!send_only) {
                    for (let mode of modeTypes) {
                        let modeExcludeSend = new Set();

                        personsExcludeModesSend.set(mode.token, modeExcludeSend);

                        for (let grid_token of neighbor_grid_tokens) {
                            let excludeSend = results[idx++];

                            for (let token of excludeSend) {
                                modeExcludeSend.add(token);
                            }
                        }
                    }
                }

                // Process receive results
                for (let mode of modeTypes) {
                    let modeExcludeReceive = new Set();

                    personsExcludeModesReceive.set(mode.token, modeExcludeReceive);

                    for (let grid_token of neighbor_grid_tokens) {
                        let excludeReceive = results[idx++];

                        for (let token of excludeReceive) {
                            modeExcludeReceive.add(token);
                        }
                    }
                }

                for (let token of person_tokens) {
                    //send
                    let hasSendModeMatch = false;

                    for (let includedMode of included_modes.send) {
                        // If not excluded from receiving
                        if (!personsExcludeModesReceive.get(includedMode).has(token)) {
                            hasSendModeMatch = true;
                            break;
                        }
                    }

                    if (!hasSendModeMatch) {
                        personsExclude.send.add(token);
                    }

                    //receive
                    if (!send_only) {
                        let hasReceiveModeMatch = false;

                        for (let includedMode of included_modes.receive) {
                            // If not excluded from sending
                            if (!personsExcludeModesSend.get(includedMode).has(token)) {
                                hasReceiveModeMatch = true;
                                break;
                            }
                        }

                        if (!hasReceiveModeMatch) {
                            personsExclude.receive.add(token);
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_modes_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterModes:', e);
                reject(e);
            }
        });
    }

    function filterVerifications() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('verifications')) {
                return resolve();
            }

            try {
                const verificationTypes = ['in_person', 'linkedin'];

                let pipeline = cacheService.startPipeline();

                // Get all verification data for each grid token and type
                for (let type of verificationTypes) {
                    for (let grid_token of neighbor_grid_tokens) {
                        // Get verified persons
                        pipeline.sMembers(
                            cacheService.keys.persons_grid_set(grid_token, `verified:${type}`),
                        );

                        // Get send/receive filter states
                        if (!send_only) {
                            pipeline.sMembers(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    `verifications:${type}`,
                                    'send',
                                ),
                            );
                        }

                        pipeline.sMembers(
                            cacheService.keys.persons_grid_send_receive(
                                grid_token,
                                `verifications:${type}`,
                                'receive',
                            ),
                        );
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let verifiedPersons = new Map();
                let sendVerification = new Map();
                let receiveVerification = new Map();

                // Process pipeline results
                for (let type of verificationTypes) {
                    verifiedPersons.set(type, new Set());
                    sendVerification.set(type, new Set());
                    receiveVerification.set(type, new Set());

                    for (let grid_token of neighbor_grid_tokens) {
                        let send_tokens;
                        let verified_tokens = results[idx++];

                        if (!send_only) {
                            send_tokens = results[idx++];
                        }

                        let receive_tokens = results[idx++];

                        // Track verified persons
                        for (let token of verified_tokens) {
                            verifiedPersons.get(type).add(token);
                        }

                        if (!send_only) {
                            // Track send filter states
                            for (let token of send_tokens) {
                                sendVerification.get(type).add(token);
                            }
                        }

                        // Track receive filter states
                        for (let token of receive_tokens) {
                            receiveVerification.get(type).add(token);
                        }
                    }
                }

                for (let token of person_tokens) {
                    for (let type of verificationTypes) {
                        if (me[`is_verified_${type}`]) {
                            //if filter enabled
                            if (
                                my_filters.verifications?.is_active &&
                                my_filters[`verification_${type}`]?.is_active
                            ) {
                                if (my_filters[`verification_${type}`].is_send) {
                                    //send to verified only
                                    if (!verifiedPersons.get(type).has(token)) {
                                        personsExclude.send.add(token);
                                    }
                                }

                                if (my_filters[`verification_${type}`].is_receive && !send_only) {
                                    //receive from verified only
                                    if (!verifiedPersons.get(type).has(token)) {
                                        personsExclude.receive.add(token);
                                    }
                                }
                            }
                        } else {
                            //if I am not verified
                            //exclude from sending/receiving if person is verified and requires verification
                            if (verifiedPersons.get(type).has(token)) {
                                if (receiveVerification.get(type).has(token)) {
                                    personsExclude.send.add(token);
                                }

                                if (!send_only) {
                                    if (sendVerification.get(type).has(token)) {
                                        personsExclude.receive.add(token);
                                    }
                                }
                            }
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_verifications_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterVerifications:', e);
                reject(e);
            }
        });
    }

    function filterGenders() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('genders')) {
                return resolve();
            }

            try {
                let gendersLookup = await getGendersLookup();

                let pipeline = cacheService.startPipeline();

                let myGender = gendersLookup.byId[me?.gender_id]?.gender_token;

                for (let grid_token of neighbor_grid_tokens) {
                    // Get all gender set members
                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            pipeline.sMembers(
                                cacheService.keys.persons_grid_set(grid_token, `gender:${token}`),
                            );
                        }
                    }

                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            if (!send_only) {
                                pipeline.sMembers(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `genders:${token}`,
                                        'send',
                                    ),
                                );
                            }

                            pipeline.sMembers(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `genders:${token}`,
                                    'receive',
                                ),
                            );
                        }
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let genderSets = new Map();
                let personsExcludeSend = new Map();
                let personsExcludeReceive = new Map();

                // Process pipeline results
                for (let grid_token of neighbor_grid_tokens) {
                    // Process gender set memberships
                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            if (!genderSets.has(token)) {
                                genderSets.set(token, new Set());
                            }

                            let members = results[idx++];

                            for (let member of members) {
                                genderSets.get(token).add(member);
                            }
                        }
                    }

                    // Process gender exclusions
                    for (let gender_token in gendersLookup.byToken) {
                        if (gender_token !== 'any') {
                            if (!personsExcludeSend.has(gender_token)) {
                                personsExcludeSend.set(gender_token, new Set());
                            }

                            if (!personsExcludeReceive.has(gender_token)) {
                                personsExcludeReceive.set(gender_token, new Set());
                            }

                            if (!send_only) {
                                // Send exclusions
                                let sendExclusions = results[idx++];

                                for (let token of sendExclusions) {
                                    personsExcludeSend.get(gender_token).add(token);
                                }
                            }

                            // Receive exclusions
                            let receiveExclusions = results[idx++];

                            for (let token of receiveExclusions) {
                                personsExcludeReceive.get(gender_token).add(token);
                            }
                        }
                    }
                }

                //if gender not set, exclude for all excluded
                if (!myGender) {
                    for (let [gender_token, tokens] of personsExcludeReceive) {
                        for (let token of tokens) {
                            personsExclude.send.add(token);
                        }
                    }

                    if (!send_only) {
                        for (let [gender_token, tokens] of personsExcludeSend) {
                            for (let token of tokens) {
                                personsExclude.receive.add(token);
                            }
                        }
                    }
                } else {
                    // Process each person token
                    for (let token of person_tokens) {
                        // Get person's gender
                        let personGender = null;

                        for (let [genderToken, members] of genderSets) {
                            if (members.has(token)) {
                                personGender = genderToken;
                                break;
                            }
                        }

                        if (!personGender) {
                            personsExclude.send.add(token);

                            if (!send_only) {
                                personsExclude.receive.add(token);
                            }

                            continue;
                        }

                        // Exclude send if person has excluded my gender or I have excluded the person's gender
                        if (
                            personsExcludeReceive.get(myGender).has(token) ||
                            personsExcludeSend.get(personGender).has(my_token)
                        ) {
                            personsExclude.send.add(token);
                        }

                        if (!send_only) {
                            // Exclude receive if person has excluded my gender or I have excluded the person's gender
                            if (
                                personsExcludeSend.get(myGender).has(token) ||
                                personsExcludeReceive.get(personGender).has(my_token)
                            ) {
                                personsExclude.receive.add(token);
                            }
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_genders_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterGenders:', e);
                reject(e);
            }
        });
    }

    function filterDistance() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('distance')) {
                return resolve();
            }

            try {
                let use_location = {
                    lat: me.location_lat,
                    lon: me.location_lon,
                };

                if (activity_location) {
                    use_location.lat = activity_location.lat;
                    use_location.lon = activity_location.lon;
                }

                let my_grid = me.grid;
                let filter = my_filters.distance;

                let my_exclude_send_distance = DEFAULT_DISTANCE_MILES;
                let my_exclude_receive_distance = DEFAULT_DISTANCE_MILES;

                if (filter?.is_active && filter.filter_value) {
                    if (filter.is_send) {
                        my_exclude_send_distance = filter.filter_value;
                    }

                    if (filter.is_receive) {
                        my_exclude_receive_distance = filter.filter_value;
                    }
                }

                let pipeline = cacheService.startPipeline();

                for (let person_token of persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'location');
                    pipeline.hGet(person_key, 'grid');
                    pipeline.hGet(filter_key, 'distance');
                }

                let results = await cacheService.execPipeline(pipeline);
                let idx = 0;

                for (let person_token of persons_not_excluded_after_stage_1) {
                    try {
                        let their_location = results[idx++];
                        let their_grid = results[idx++];
                        let their_distance_filter = results[idx++];

                        if (their_location) {
                            their_location = JSON.parse(their_location);
                        }

                        if (their_grid) {
                            their_grid = JSON.parse(their_grid);
                        }

                        if (their_distance_filter) {
                            their_distance_filter = JSON.parse(their_distance_filter);
                        }

                        let should_exclude_send = false;
                        let should_exclude_receive = false;

                        // Calculate distance between persons
                        let distance_km = null;

                        if (use_location && their_location) {
                            // Calculate using lat/lon
                            distance_km = calculateDistanceMeters(
                                use_location,
                                {
                                    lat: their_location.lat,
                                    lon: their_location.lon,
                                },
                                true,
                            );
                        } else if (my_grid && their_grid) {
                            if (my_grid.id === their_grid.id) {
                                distance_km = 0;
                            } else {
                                try {
                                    my_grid.data = await getGridById(my_grid.id);
                                    their_grid.data = await getGridById(their_grid.id);

                                    distance_km = calculateDistanceMeters(
                                        {
                                            lat: my_grid.data.center_lat,
                                            lon: my_grid.data.center_lon,
                                        },
                                        {
                                            lat: their_grid.data.center_lat,
                                            lon: their_grid.data.center_lon,
                                        },
                                        true,
                                    );

                                    distance_km = distance_km / 3;
                                } catch (e) {
                                    console.error('Error calculating grid distance:', e);
                                }
                            }
                        }

                        let compare_distance = distance_km / kms_per_mile;

                        if (distance_km === null) {
                            personsExclude.send.add(person_token);

                            if (!send_only) {
                                personsExclude.receive.add(person_token);
                            }

                            continue;
                        }

                        // Check activity timing feasibility
                        let activityStartTime = null;

                        const now = timeNow(true);

                        if (activity?.when?.data?.start) {
                            activityStartTime = activity.when.data.start;
                        } else if (activity?.when?.in_mins) {
                            activityStartTime = new Date(now + activity.when.in_mins * 60);
                        }

                        if (activityStartTime) {
                            const AVERAGE_TRAVEL_SPEED_MPH = 30;
                            const timeToActivityMins = (new Date(activityStartTime) - now) / 60;
                            const travelTimeNeededMins =
                                (compare_distance / AVERAGE_TRAVEL_SPEED_MPH) * 60;
                            const BUFFER_MINS_LATE = 5;

                            if (timeToActivityMins < travelTimeNeededMins - BUFFER_MINS_LATE) {
                                personsExclude.send.add(person_token);

                                if (!send_only) {
                                    personsExclude.receive.add(person_token);
                                }

                                continue;
                            }
                        }

                        // Check if I should exclude sending/receiving to/from them
                        if (compare_distance > my_exclude_send_distance) {
                            should_exclude_send = true;
                        }

                        if (compare_distance > my_exclude_receive_distance) {
                            should_exclude_receive = true;
                        }

                        // Check their distance preferences
                        let their_exclude_send_distance = DEFAULT_DISTANCE_MILES;
                        let their_exclude_receive_distance = DEFAULT_DISTANCE_MILES;

                        if (
                            their_distance_filter?.is_active &&
                            their_distance_filter.filter_value
                        ) {
                            if (their_distance_filter.is_send) {
                                their_exclude_send_distance = their_distance_filter.filter_value;
                            }
                            if (their_distance_filter.is_receive) {
                                their_exclude_receive_distance = their_distance_filter.filter_value;
                            }
                        }

                        if (compare_distance > their_exclude_send_distance) {
                            should_exclude_receive = true;
                        }

                        if (compare_distance > their_exclude_receive_distance) {
                            should_exclude_send = true;
                        }

                        if (should_exclude_send) {
                            personsExclude.send.add(person_token);
                        }

                        if (should_exclude_receive && !send_only) {
                            personsExclude.receive.add(person_token);
                        }
                    } catch (e) {
                        console.error('Error processing distance for person:', person_token, e);
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_filter_distance_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterDistance:', e);
                reject(e);
            }
        });
    }

    function filterAges() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('ages')) {
                return resolve();
            }

            try {
                let my_age_filter = my_filters.ages;

                let pipeline = cacheService.startPipeline();

                for (let person_token of persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'age');
                    pipeline.hGet(filter_key, 'ages');
                }

                let results = await cacheService.execPipeline(pipeline);
                let idx = 0;

                for (let person_token of persons_not_excluded_after_stage_1) {
                    try {
                        let their_age = results[idx++];
                        let their_age_filter = results[idx++];

                        if (their_age) {
                            their_age = parseInt(their_age);
                        }

                        if (their_age_filter) {
                            their_age_filter = JSON.parse(their_age_filter);
                        }

                        let should_exclude_send = false;
                        let should_exclude_receive = false;

                        // Check my age preferences
                        if (my_age_filter?.is_active) {
                            let my_min_age = parseInt(my_age_filter.filter_value_min) || minAge;
                            let my_max_age = parseInt(my_age_filter.filter_value_max) || maxAge;

                            if (their_age < my_min_age || their_age > my_max_age) {
                                if (my_age_filter.is_send) {
                                    should_exclude_send = true;
                                }

                                if (my_age_filter.is_receive) {
                                    should_exclude_receive = true;
                                }
                            }
                        }

                        // Check their age preferences
                        if (their_age_filter?.is_active) {
                            let their_min_age =
                                parseInt(their_age_filter.filter_value_min) || minAge;
                            let their_max_age =
                                parseInt(their_age_filter.filter_value_max) || maxAge;

                            if (me.age < their_min_age || me.age > their_max_age) {
                                if (their_age_filter.is_receive) {
                                    should_exclude_send = true;
                                }

                                if (their_age_filter.is_send) {
                                    should_exclude_receive = true;
                                }
                            }
                        }

                        if (should_exclude_send) {
                            personsExclude.send.add(person_token);
                        }

                        if (should_exclude_receive && !send_only) {
                            personsExclude.receive.add(person_token);
                        }
                    } catch (e) {
                        console.error('Error processing person:', person_token, e);
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_filter_ages_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterAges:', e);
                reject(e);
            }
        });
    }

    function filterReviews() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('reviews')) {
                return resolve();
            }

            try {
                let myReviewsFilter = my_filters.reviews;

                if (!myReviewsFilter) {
                    return resolve();
                }

                let myNewReviewsFilter = my_filters.reviews_new;

                let me_exclude_send_new =
                    myReviewsFilter.is_active &&
                    !myNewReviewsFilter?.is_active &&
                    myNewReviewsFilter?.is_send;

                let me_exclude_receive_new =
                    myReviewsFilter.is_active &&
                    !myNewReviewsFilter?.is_active &&
                    myNewReviewsFilter?.is_receive;

                let myExclusions = {
                    send: new Map(),
                    receive: new Map(),
                };

                const reviewTypes = ['safety', 'trust', 'timeliness', 'friendliness', 'fun'];

                for (let type of reviewTypes) {
                    let filter = my_filters[`reviews_${type}`];

                    if (myReviewsFilter.is_active && filter?.is_active) {
                        let value = filter.filter_value || reviewService.filters.default;

                        if (filter.is_send) {
                            myExclusions.send.set(type, value);
                        }

                        if (filter.is_receive) {
                            myExclusions.receive.set(type, value);
                        }
                    }
                }

                let new_persons_tokens = new Set();
                let persons_ratings = new Map();

                let exclude_match_new = {
                    send: new Set(),
                    receive: new Set(),
                };

                let exclude_settings = {
                    send: new Map(),
                    receive: new Map(),
                };

                // Get new members data
                let pipeline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline.sMembers(
                        cacheService.keys.persons_grid_set(grid_token, 'is_new_person'),
                    );
                }

                let results = await cacheService.execPipeline(pipeline);

                for (let grid of results) {
                    for (let person_token of grid) {
                        new_persons_tokens.add(person_token);
                    }
                }

                // Reviews ratings and filter settings
                pipeline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    // Persons who excluded match with new
                    if (!send_only) {
                        pipeline.sMembers(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                'reviews:match_new',
                                'send',
                            ),
                        );
                    }

                    pipeline.sMembers(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            'reviews:match_new',
                            'receive',
                        ),
                    );

                    for (let type of reviewTypes) {
                        // Ratings for each person
                        pipeline.zRangeWithScores(
                            cacheService.keys.persons_grid_sorted(grid_token, `reviews:${type}`),
                            0,
                            -1,
                        );

                        // Exclude filter settings for each person
                        if (!send_only) {
                            pipeline.zRangeWithScores(
                                cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                    grid_token,
                                    `reviews:${type}`,
                                    'send',
                                ),
                                0,
                                -1,
                            );
                        }

                        pipeline.zRangeWithScores(
                            cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                grid_token,
                                `reviews:${type}`,
                                'receive',
                            ),
                            0,
                            -1,
                        );
                    }
                }

                results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                // Process match new preferences
                for (let grid_token of neighbor_grid_tokens) {
                    if (!send_only) {
                        let exclude_send_new = results[idx++];

                        for (let token of exclude_send_new) {
                            exclude_match_new.send.add(token);
                        }
                    }

                    let exclude_receive_new = results[idx++];

                    for (let token of exclude_receive_new) {
                        exclude_match_new.receive.add(token);
                    }

                    // Process ratings for each review type
                    for (let type of reviewTypes) {
                        // Get person ratings
                        let ratings = results[idx++];

                        for (let person of ratings) {
                            let person_token = person.value;

                            if (!persons_ratings.has(person_token)) {
                                persons_ratings.set(person_token, new Map());
                            }

                            persons_ratings.get(person_token).set(type, person.score);
                        }

                        if (!send_only) {
                            // Get send settings
                            let exclude_send = results[idx++];

                            for (let person of exclude_send) {
                                let person_token = person.value;

                                if (!exclude_settings.send.has(person_token)) {
                                    exclude_settings.send.set(person_token, new Map());
                                }

                                exclude_settings.send.get(person_token).set(type, person.score);
                            }
                        }

                        // Get receive settings
                        let exclude_receive = results[idx++];

                        for (let person of exclude_receive) {
                            let person_token = person.value;

                            if (!exclude_settings.receive.has(person_token)) {
                                exclude_settings.receive.set(person_token, new Map());
                            }

                            exclude_settings.receive.get(person_token).set(type, person.score);
                        }
                    }
                }

                // Apply review filters
                for (let token of persons_not_excluded_after_stage_1) {
                    let auto_include = {
                        send: false,
                        receive: false,
                    };

                    // Handle new member matching
                    if (new_persons_tokens.has(token)) {
                        if (me.is_new) {
                            if (!me_exclude_send_new && !exclude_match_new.receive.has(token)) {
                                auto_include.send = true;
                            }

                            if (
                                !me_exclude_receive_new &&
                                !exclude_match_new.send.has(token) &&
                                !send_only
                            ) {
                                auto_include.receive = true;
                            }
                        } else {
                            if (!me_exclude_send_new) {
                                auto_include.send = true;
                            }

                            if (!me_exclude_receive_new && !send_only) {
                                auto_include.receive = true;
                            }
                        }
                    }

                    // Check review settings
                    let exclude_send = false;
                    let exclude_receive = false;

                    let myRatings = me.reviews || {};
                    let personRatings = persons_ratings.get(token) || new Map();

                    // Bi-directional send/receive filter settings
                    if (!auto_include.send) {
                        for (let type of reviewTypes) {
                            let my_threshold = myExclusions.send.get(type);
                            let their_threshold = exclude_settings.receive.get(token)?.get(type);

                            if (!my_threshold && !their_threshold) {
                                continue;
                            }

                            if (
                                (my_threshold && !isNumeric(personRatings.get(type))) ||
                                (my_threshold && personRatings.get(type) < my_threshold)
                            ) {
                                exclude_send = true;
                                break;
                            }

                            if (
                                (their_threshold && !isNumeric(myRatings[type])) ||
                                (their_threshold && myRatings[type] < their_threshold)
                            ) {
                                if (me.is_new && !exclude_match_new.receive.has(token)) {
                                    continue;
                                }

                                exclude_send = true;
                                break;
                            }
                        }
                    }

                    if (!auto_include.receive && !send_only) {
                        for (let type of reviewTypes) {
                            let my_threshold = myExclusions.receive.get(type);
                            let their_threshold = exclude_settings.send.get(token)?.get(type);

                            if (!my_threshold && !their_threshold) {
                                continue;
                            }

                            if (
                                (my_threshold && !isNumeric(personRatings.get(type))) ||
                                (my_threshold && personRatings.get(type) < my_threshold)
                            ) {
                                exclude_receive = true;
                                break;
                            }

                            if (
                                (their_threshold && !isNumeric(myRatings[type])) ||
                                (their_threshold && myRatings[type] < their_threshold)
                            ) {
                                if (me.is_new && !exclude_match_new.send.has(token)) {
                                    continue;
                                }

                                exclude_receive = true;
                                break;
                            }
                        }
                    }

                    if (exclude_send) {
                        personsExclude.send.add(token);
                    }

                    if (exclude_receive && !send_only) {
                        personsExclude.receive.add(token);
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_reviews_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error('Error in filterReviews:', e);
                reject(e);
            }
        });
    }

    function filterPersonsAvailability() {
        return new Promise(async (resolve, reject) => {
            if (skipFilter('availability')) {
                return resolve();
            }

            try {
                let pipeline = cacheService.startPipeline();

                for (let person_token of persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'timezone');
                    pipeline.hGet(filter_key, 'availability');
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                // Process pipeline results into Maps
                for (let person_token of persons_not_excluded_after_stage_1) {
                    try {
                        let timezone = results[idx++];
                        let availability = results[idx++];

                        try {
                            availability = JSON.parse(availability);
                        } catch (e) {
                            console.error(e);
                            continue;
                        }

                        let is_available = isPersonAvailable(
                            {
                                timezone,
                            },
                            availability,
                            activity,
                        );

                        if (!is_available) {
                            personsExclude.send.add(person_token);
                        }
                    } catch (e) {
                        console.error('Error parsing person data:', person_token, e);
                    }
                }

                if (debug_logs) {
                    console.log({
                        after_filter_availability_excluded: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (error) {
                console.error('Error in filterPersonsAvailability:', error);
                reject(error);
            }
        });
    }

    function filterSection(sectionKey, getOptions, isMultiSelect) {
        return new Promise(async (resolve, reject) => {
            if (skipFilter(sectionKey)) {
                return resolve();
            }

            try {
                let options = await getOptions();
                let cache_key = cacheService.keys.person_sections(my_token);
                let sectionData = (await cacheService.hGetItem(cache_key, sectionKey)) || {};

                // Build sets for my selected options
                let myOptionTokens = new Set();

                if (isMultiSelect) {
                    for (let key in sectionData) {
                        if (!sectionData[key].deleted) {
                            myOptionTokens.add(sectionData[key].token);
                        }
                    }
                } else if (Object.keys(sectionData).length) {
                    let item = Object.values(sectionData)[0];
                    myOptionTokens.add(item.token);
                }

                let pipeline = cacheService.startPipeline();

                // Get all set members and exclusions for each grid and option
                for (let grid_token of neighbor_grid_tokens) {
                    for (let option of options) {
                        pipeline.sMembers(
                            cacheService.keys.persons_grid_set(
                                grid_token,
                                `${sectionKey}:${option.token}`,
                            ),
                        );
                    }

                    // Get excluded send/receive states
                    for (let option of options) {
                        if (!send_only) {
                            pipeline.sMembers(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `${sectionKey}:${option.token}`,
                                    'send',
                                ),
                            );
                        }

                        pipeline.sMembers(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `${sectionKey}:${option.token}`,
                                'receive',
                            ),
                        );
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let optionSets = new Map();
                let excludeSend = new Map();
                let excludeReceive = new Map();

                // Process pipeline results for each grid
                for (let grid_token of neighbor_grid_tokens) {
                    // Process option set memberships
                    for (let option of options) {
                        if (!optionSets.has(option.token)) {
                            optionSets.set(option.token, new Set());
                        }

                        let members = results[idx++];

                        for (let member of members) {
                            optionSets.get(option.token).add(member);
                        }
                    }

                    // Process exclusions
                    for (let option of options) {
                        if (!excludeSend.has(option.token)) {
                            excludeSend.set(option.token, new Set());
                        }

                        if (!excludeReceive.has(option.token)) {
                            excludeReceive.set(option.token, new Set());
                        }

                        if (!send_only) {
                            // Send exclusions
                            let sendExclusions = results[idx++];

                            for (let token of sendExclusions) {
                                excludeSend.get(option.token).add(token);
                            }
                        }

                        // Receive exclusions
                        let receiveExclusions = results[idx++];

                        for (let token of receiveExclusions) {
                            excludeReceive.get(option.token).add(token);
                        }
                    }
                }

                // If no options set, handle exclusions
                if (myOptionTokens.size === 0) {
                    for (let [optionToken, excluded] of excludeReceive) {
                        for (let token of excluded) {
                            personsExclude.send.add(token);
                        }
                    }

                    if (!send_only) {
                        for (let [optionToken, excluded] of excludeSend) {
                            for (let token of excluded) {
                                personsExclude.receive.add(token);
                            }
                        }
                    }

                    if (debug_logs) {
                        console.log({
                            [`after_${sectionKey}_excluded`]: {
                                send: personsExclude.send.size,
                                receive: personsExclude.receive.size,
                            },
                        });
                    }

                    return resolve();
                }

                // Process each person token
                for (let token of person_tokens) {
                    let personOptionTokens = new Set();

                    // Find all options for this person
                    for (let [optionToken, members] of optionSets) {
                        if (members.has(token)) {
                            personOptionTokens.add(optionToken);
                        }
                    }

                    if (personOptionTokens.size === 0) {
                        // Exclude sending/receiving if filter specified (with importance)
                        for (let [k, excludedSet] of excludeSend) {
                            if (excludedSet.has(my_token)) {
                                personsExclude.send.add(token);
                                break;
                            }
                        }

                        if (!send_only) {
                            for (let [k, excludedSet] of excludeReceive) {
                                if (excludedSet.has(my_token)) {
                                    personsExclude.receive.add(token);
                                    break;
                                }
                            }
                        }
                    } else if (isMultiSelect) {
                        // Check bi-directional exclusions for multi-select
                        let shouldExcludeSend = true;
                        let shouldExcludeReceive = true;

                        // For each of my selected options
                        for (let myOption of myOptionTokens) {
                            // For each of their options
                            for (let theirOption of personOptionTokens) {
                                // Check if they accept my option and I accept theirs
                                if (
                                    !excludeReceive.get(myOption).has(token) &&
                                    !excludeSend.get(theirOption).has(my_token)
                                ) {
                                    shouldExcludeSend = false;
                                }

                                if (!send_only) {
                                    if (
                                        !excludeSend.get(myOption).has(token) &&
                                        !excludeReceive.get(theirOption).has(my_token)
                                    ) {
                                        shouldExcludeReceive = false;
                                    }
                                }
                            }
                        }

                        if (shouldExcludeSend) {
                            personsExclude.send.add(token);
                        }

                        if (shouldExcludeReceive && !send_only) {
                            personsExclude.receive.add(token);
                        }
                    } else {
                        // Handle single-select exclusions
                        let personOption = Array.from(personOptionTokens)[0];
                        let myOption = Array.from(myOptionTokens)[0];

                        // Exclude send/receive if person has excluded my option or I have excluded their option
                        if (
                            excludeReceive.get(myOption).has(token) ||
                            excludeSend.get(personOption).has(my_token)
                        ) {
                            personsExclude.send.add(token);
                        }

                        if (!send_only) {
                            if (
                                excludeSend.get(myOption).has(token) ||
                                excludeReceive.get(personOption).has(my_token)
                            ) {
                                personsExclude.receive.add(token);
                            }
                        }
                    }
                }

                if (debug_logs) {
                    console.log({
                        [`after_${sectionKey}_excluded`]: {
                            send: personsExclude.send.size,
                            receive: personsExclude.receive.size,
                        },
                    });
                }

                resolve();
            } catch (e) {
                console.error(`Error in filterSection for ${sectionKey}:`, e);
                reject(e);
            }
        });
    }

    function organizeFinal() {
        let not_excluded = {
            send: new Set(),
            receive: new Set(),
        };

        for (let person_token of persons_not_excluded_after_stage_1) {
            let included = false;

            if (!personsExclude.send.has(person_token)) {
                not_excluded.send.add(person_token);
                organized.counts.send++;
                included = true;

                // Add to send matches if preparing notifications
                if (!counts_only && !exclude_only) {
                    let personInterests = personsInterests.get(person_token);

                    personInterests.person_token = person_token;

                    if (!personInterests) {
                        console.error(
                            'Unexpectedly missing interests data for included send token',
                        );
                    } else {
                        organized.matches.send.push(personInterests);
                    }

                    //delete un-needed data
                    delete personInterests.sections;
                    delete personInterests.filters;
                }
            }

            // If my online status is set to offline, exclude receiving from all
            if (!me.is_online && !send_only) {
                personsExclude.receive.add(person_token);
            } else if (!send_only) {
                // Allow receiving notifications if not excluded
                if (!personsExclude.receive.has(person_token)) {
                    not_excluded.receive.add(person_token);
                    organized.counts.receive++;
                    included = true;
                }
            }

            if (included) {
                persons_not_excluded_final.add(person_token);

                let personInterests = personsInterests.get(person_token);

                if (personInterests) {
                    if (personInterests.matches?.count > 0) {
                        organized.counts.interests.total++;

                        if (personInterests.matches.total_score >= interestScoreThresholds.ultra) {
                            organized.counts.interests.ultra++;
                        } else if (
                            personInterests.matches.total_score >= interestScoreThresholds.super
                        ) {
                            organized.counts.interests.super++;
                        } else {
                            organized.counts.interests.regular++;
                        }
                    }
                }
            } else {
                organized.counts.excluded++;
            }
        }
    }

    return new Promise(async (resolve, reject) => {
        let memory_start = process.memoryUsage().heapTotal / 1024 / 1024;

        try {
            if (!me) {
                return reject('Person required');
            }

            await setActivityLocation();

            my_token = me.person_token;

            let t = timeNow();

            my_filters = await getPersonFilters(me);

            am_available = isPersonAvailable(me, my_filters.availability);

            if (debug_logs) {
                console.log({
                    time_my_filters: timeNow() - t,
                });
            }

            await processStage1();

            if (debug_logs) {
                console.log({
                    time_stage_1: timeNow() - t,
                });
            }

            t = timeNow();

            filterPersonsAfterStage1();

            if (debug_logs) {
                console.log({
                    persons_after_stage_1: persons_not_excluded_after_stage_1.size,
                });

                console.log({
                    after_filter_stage_1_excluded: {
                        send: personsExclude.send.size,
                        receive: personsExclude.receive.size,
                    },
                });

                console.log({
                    filter_persons: timeNow() - t,
                });
            }

            t = timeNow();

            await processStage2();

            if (debug_logs) {
                console.log({
                    time_stage_2: timeNow() - t,
                });
            }

            t = timeNow();

            if (!exclude_only) {
                await matchInterests();
            }

            if (debug_logs) {
                console.log({
                    time_filter_interests: timeNow() - t,
                });
            }

            organizeFinal();

            let memory_end = process.memoryUsage().heapTotal / 1024 / 1024;

            if (debug_logs) {
                console.log({
                    memory_start,
                    memory_end,
                });

                console.log({
                    final_persons: persons_not_excluded_final.size,
                });
            }

            neighbor_grid_tokens = null;
            person_tokens = null;

            persons_not_excluded_after_stage_1 = null;
            persons_not_excluded_final = null;

            if (exclude_only) {
                return resolve(personsExclude);
            }

            personsExclude = null;

            if (counts_only) {
                return resolve(organized);
            }

            sortMatches();

            resolve(organized);
        } catch (e) {
            console.error(e);
            reject(e);
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
    let filtered_matches = [];
    let organized_matches = new Map();
    let filter_networks_persons = new Map();
    let persons_excluded = new Set();

    let debug_enabled = require('../dev/debug').matching.filter_matches;

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
        if(debug_recent_notifications) {
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
                if (Object.keys(personActivities).length && !debug_enabled) {
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

                    if (activity_overlaps) {
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

        if (debug_enabled) {
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

function organizePersonInterests(sections, myInterests, otherPersonInterests) {
    function setMatchData(
        section,
        item_token,
        match_types,
        table_key = null,
        name,
        favorite_position,
        secondary,
        importance,
        totals,
    ) {
        otherPersonInterests.matches.items[item_token] = {
            section: section.token,
            token: item_token,
            table_key: table_key,
            name: name,
            totals: totals,
            match: {
                types: match_types,
                mine: {
                    favorite: {
                        position: favorite_position?.mine || null,
                    },
                    secondary: secondary?.mine || null,
                    importance: importance?.mine || null,
                },
                theirs: {
                    favorite: {
                        position: favorite_position?.theirs || null,
                    },
                    secondary: secondary?.theirs || null,
                    importance: importance?.theirs || null,
                },
            },
        };
    }

    let myMergedItems = {};
    let theirMergedItems = {};

    for (let section of sections) {
        function calcPersonalTotals(myItem, theirItem) {
            //calc total number of items/favorited
            if (myItem && !myItem.deleted) {
                section_totals.mine.all++;

                if (myItem.is_favorite) {
                    section_totals.mine.favorite++;
                }
            }

            if (theirItem && !theirItem.deleted) {
                section_totals.theirs.all++;

                if (theirItem.is_favorite) {
                    section_totals.theirs.favorite++;
                }
            }
        }

        myMergedItems[section.token] = {};
        theirMergedItems[section.token] = {};

        let myItems = myInterests.sections[section.token] || {};
        let myFilter = myInterests.filters[section.token] || {};
        let theirItems = otherPersonInterests.sections[section.token] || {};
        let theirFilter = otherPersonInterests.filters[section.token] || {};

        //see if both our filters are enabled
        let myFilterEnabled = myFilter?.is_active && myFilter.is_send;
        let theirFilterEnabled = theirFilter?.is_active && theirFilter.is_receive;

        let section_totals = {
            mine: {
                all: 0,
                favorite: 0,
            },
            theirs: {
                all: 0,
                favorite: 0,
            },
        };

        //merge my personal/filter items
        for (let token in myItems) {
            if (!(token in myMergedItems[section.token])) {
                myMergedItems[section.token][token] = {
                    personal: null,
                    filter: null,
                };
            }

            myMergedItems[section.token][token].personal = myItems[token];
        }

        if (myFilter.items) {
            for (let k in myFilter.items) {
                let item = myFilter.items[k];

                if (!(item.token in myMergedItems[section.token])) {
                    myMergedItems[section.token][item.token] = {
                        personal: null,
                        filter: null,
                    };
                }

                myMergedItems[section.token][item.token].filter = item;
            }
        }

        //merge their personal/filter items
        for (let token in theirItems) {
            if (!(token in theirMergedItems[section.token])) {
                theirMergedItems[section.token][token] = {
                    personal: null,
                    filter: null,
                };
            }

            theirMergedItems[section.token][token].personal = theirItems[token];
        }

        if (theirFilter.items) {
            for (let k in theirFilter.items) {
                let item = theirFilter.items[k];

                if (!(item.token in theirMergedItems[section.token])) {
                    theirMergedItems[section.token][item.token] = {
                        personal: null,
                        filter: null,
                    };
                }

                theirMergedItems[section.token][item.token].filter = item;
            }
        }

        for (let item_token in myMergedItems[section.token]) {
            let myItem = myMergedItems[section.token][item_token];
            calcPersonalTotals(myItem?.personal);
        }

        for (let item_token in theirMergedItems[section.token]) {
            let theirItem = theirMergedItems[section.token][item_token];
            calcPersonalTotals(null, theirItem?.personal);
        }

        for (let item_token in myMergedItems[section.token]) {
            let myItem = myMergedItems[section.token][item_token];
            let theirItem = theirMergedItems[section.token][item_token];

            let isMyItem = myItem?.personal && !myItem.personal.deleted;
            let isTheirItem = theirItem?.personal && !theirItem.personal.deleted;
            let isMyFilter =
                myFilterEnabled &&
                myItem?.filter &&
                myItem.filter.is_active &&
                !myItem.filter.is_negative &&
                !myItem.filter.deleted;
            let isTheirFilter =
                theirFilterEnabled &&
                theirItem?.filter &&
                theirItem.filter.is_active &&
                !theirItem.filter.is_negative &&
                !theirItem.filter.deleted;

            // Only proceed if there's at least one type of match
            if (!(isMyItem || isTheirItem || isMyFilter || isTheirFilter)) {
                continue;
            }

            let matchTypes = {};

            if (isMyFilter) {
                matchTypes.my_filter = true;
            }

            if (isTheirFilter) {
                matchTypes.their_filter = true;
            }

            if (isMyItem) {
                matchTypes.my_item = true;
            }

            if (isTheirItem) {
                matchTypes.their_item = true;
            }

            let table_key =
                myItem?.personal?.table_key ||
                theirItem?.personal?.table_key ||
                myItem?.filter?.table_key ||
                theirItem?.filter?.table_key;
            let item_name =
                myItem?.personal?.name ||
                theirItem?.personal?.name ||
                myItem?.filter?.name ||
                theirItem?.filter?.name;

            if (
                Object.keys(matchTypes).length > 0 &&
                ((isMyItem && isTheirItem) ||
                    (isMyFilter && isTheirItem) ||
                    (isTheirFilter && isMyItem) ||
                    (isMyFilter && isTheirFilter))
            ) {
                setMatchData(
                    section,
                    item_token,
                    matchTypes,
                    table_key,
                    item_name,
                    {
                        mine: matchTypes.my_item ? myItem.personal.favorite_position : null,
                        theirs: matchTypes.their_item ? theirItem.personal.favorite_position : null,
                    },
                    {
                        mine: {
                            item: matchTypes.my_item ? myItem.personal.secondary || null : null,
                            filter: matchTypes.my_filter ? myItem.filter.secondary || null : null,
                        },
                        theirs: {
                            item: matchTypes.their_item
                                ? theirItem.personal.secondary || null
                                : null,
                            filter: matchTypes.their_filter
                                ? theirItem.filter.secondary || null
                                : null,
                        },
                    },
                    {
                        mine: matchTypes.my_filter ? myItem.filter.importance : null,
                        theirs: matchTypes.their_filter ? theirItem.filter.importance : null,
                    },
                    section_totals,
                );
            }
        }
    }
}

function calculateTotalScore(items) {
    let totalScore = 0;

    for (let item of items) {
        let score = getBaseScore(item);

        let importanceMultiplier = getImportanceMultiplier(item);
        let favoriteMultiplier = getFavoriteMultiplier(item);
        let secondaryMultiplier = getSecondaryMultiplier(item);

        let weightedScore = score * importanceMultiplier * favoriteMultiplier * secondaryMultiplier;

        item.score = weightedScore;

        totalScore += weightedScore;
    }

    return totalScore;
}

function getBaseScore(item) {
    let matchTypes = item.match.types;

    if (
        matchTypes.my_item &&
        matchTypes.their_item &&
        matchTypes.my_filter &&
        matchTypes.their_filter
    ) {
        return 50;
    }

    if (matchTypes.my_item && matchTypes.their_item) {
        if (matchTypes.my_filter || matchTypes.their_filter) {
            return 30;
        }

        return 15;
    }

    if (matchTypes.my_filter && matchTypes.their_item) {
        return 20;
    }

    if (matchTypes.their_filter && matchTypes.my_item) {
        return 15;
    }

    if (matchTypes.my_filter || matchTypes.their_filter) {
        return 10;
    }

    return 0;
}

function getImportanceMultiplier(item) {
    let importanceMultiplier = 1.0;
    let myImportance = item.match.mine?.importance;
    let theirImportance = item.match.theirs?.importance;

    if (myImportance && theirImportance) {
        let avgImportance = (myImportance + theirImportance) / 2;
        let base = 3;

        if (avgImportance >= 6 && avgImportance < 8) {
            base = 3.5;
        } else if (avgImportance >= 8 && avgImportance < 9) {
            base = 4;
        } else if (avgImportance >= 9 && avgImportance < 10) {
            base = 5.5;
        } else if (avgImportance >= 10) {
            base = 7;
        }

        importanceMultiplier = base;
    } else if (myImportance || theirImportance) {
        let importanceVal = myImportance || theirImportance;
        let base = 1;

        if (importanceVal >= 6 && importanceVal < 8) {
            base = 1.2;
        } else if (importanceVal >= 8 && importanceVal < 9) {
            base = 1.5;
        } else if (importanceVal >= 9 && importanceVal < 10) {
            base = 1.8;
        } else if (importanceVal >= 10) {
            base = 2.2;
        }

        importanceMultiplier = base;
    }

    return importanceMultiplier;
}

function getFavoriteMultiplier(item) {
    // Optimize matches based on total section items and favorite position
    let favoriteMultiplier = 1.0;

    let myFavoritePosition = item.match.mine?.favorite?.position;
    let theirFavoritePosition = item.match.theirs?.favorite?.position;

    if (myFavoritePosition !== null || theirFavoritePosition !== null) {
        let myTotal = item.totals.mine.all || 1;
        let theirTotal = item.totals.theirs.all || 1;
        let myFavorites = item.totals.mine.favorite || 0;
        let theirFavorites = item.totals.theirs.favorite || 0;
        let myPositionScore = myFavoritePosition ? (myTotal - myFavoritePosition + 1) / myTotal : 0;
        let theirPositionScore = theirFavoritePosition
            ? (theirTotal - theirFavoritePosition + 1) / theirTotal
            : 0;

        // Scale based on total items (more items = more significant favorites)
        let totalItemsMultiplier = 1;

        if (myPositionScore && theirPositionScore) {
            // Both have favorites - highest boost
            favoriteMultiplier = 4 * (myPositionScore + theirPositionScore);
            totalItemsMultiplier = Math.min((myTotal + theirTotal) / 4, 1);
        } else {
            // Single favorite - moderate boost
            favoriteMultiplier = 1.5 * (myPositionScore || theirPositionScore);

            if (myPositionScore) {
                totalItemsMultiplier = Math.min(myTotal / 6, 1);
            } else {
                totalItemsMultiplier = Math.min(theirTotal / 6, 1);
            }
        }

        favoriteMultiplier *= totalItemsMultiplier;
    }

    return favoriteMultiplier;
}

function getSecondaryMultiplier(item) {
    let secondaryMultiplier = 1.0;

    let itemSecondaryOptions =
        sectionsData?.[item.section]?.secondary?.[item.table_key]?.options || [];

    let myItemIndex = null;
    let theirItemIndex = null;
    let filterIncludesMe = false;
    let filterIncludesThem = false;

    if (itemSecondaryOptions) {
        if (item.match.mine?.secondary?.item) {
            myItemIndex = itemSecondaryOptions.indexOf(item.match.mine.secondary?.item);
        }

        if (item.match.theirs?.secondary?.item) {
            theirItemIndex = itemSecondaryOptions.indexOf(item.match.theirs.secondary?.item);
        }
    }

    if (item.match.theirs?.secondary?.filter && item.match.mine?.secondary?.item) {
        filterIncludesMe = item.match.theirs.secondary.filter.includes(
            item.match.mine.secondary.item,
        );
    }

    if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.item) {
        filterIncludesThem = item.match.mine.secondary.filter.includes(
            item.match.theirs.secondary.item,
        );
    }

    if (item.match.mine?.secondary?.item && item.match.theirs?.secondary?.item) {
        let indexDiff = 0;

        if (isNumeric(myItemIndex) && isNumeric(theirItemIndex)) {
            indexDiff = Math.abs(myItemIndex - theirItemIndex);
            secondaryMultiplier =
                1 + itemSecondaryOptions.length / (indexDiff * itemSecondaryOptions.length + 1);
        }

        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // Both item and filter
            if (filterIncludesMe && filterIncludesThem) {
                secondaryMultiplier *= 10;
            } else if (filterIncludesMe || filterIncludesThem) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 3;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // Both items, my filter
            if (filterIncludesThem) {
                secondaryMultiplier *= 3;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else if (item.match.theirs?.secondary?.filter) {
            // Both items, their filter

            if (filterIncludesMe) {
                secondaryMultiplier *= 3;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else {
            secondaryMultiplier *= 1.2;
        }
    } else if (item.match.mine?.secondary?.item) {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            //Only my item, both filters
            if (filterIncludesMe) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 2;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // My item, my filter
            secondaryMultiplier *= 1.5;
        } else if (item.match.theirs?.secondary?.filter) {
            // My item, their filter

            if (filterIncludesMe) {
                secondaryMultiplier *= 4;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else {
            // My item only

            secondaryMultiplier *= 1.2;
        }
    } else if (item.match.theirs?.secondary?.item) {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // Their item, both filters
            if (filterIncludesThem) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 2;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // Their item, my filter
            if (filterIncludesThem) {
                secondaryMultiplier *= 4;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else if (item.match.theirs?.secondary?.filter) {
            // Only their item, their filter
            secondaryMultiplier *= 1.5;
        } else {
            secondaryMultiplier *= 1.2;
        }
    } else {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // No items exist, both filters
            secondaryMultiplier *= 1.3;
        } else if (item.match.mine?.secondary?.filter) {
            // No items, my filter
            secondaryMultiplier *= 1.1;
        } else if (item.match.theirs?.secondary?.filter) {
            // No items, their filter
            secondaryMultiplier *= 1.1;
        } else {
            secondaryMultiplier *= 1.0;
        }
    }

    return secondaryMultiplier;
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

module.exports = {
    getMatches,
    filterMatches,
    personToPersonInterests,
};
