const dayjs = require('dayjs');

let cacheService = require('../services/cache');
let dbService = require('../services/db');

let availabilityService = require('../services/availability');
let gridService = require('../services/grid');

const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow, shuffleFunc } = require('./shared');
const { getNetworksForFilters } = require('./network');
const { getModes, getPersonExcludedModes } = require('./modes');
const { getGendersLookup } = require('./genders');
const { getDrinking } = require('./drinking');
const { getSmoking } = require('./smoking');
const { getLifeStages } = require('./life_stages');
const { getRelationshipStatus } = require('./relationships');
const { getPolitics } = require('./politics');
const { getReligions } = require('./religion');
const { isPersonAvailable } = require('./availability');

const DEFAULT_DISTANCE_MILES = 20;
const MAX_PERSONS_PROCESS = 1000;

function getMatches(me, counts_only = false, location = null, activity = null) {
    let my_token, my_filters;
    let am_online = me.is_online;
    let am_available = false;

    let neighbor_grid_tokens = [];
    let person_tokens = {};
    let selected_persons_data = {};

    let exclude = {
        send: {},
        receive: {}
    };
    
    let persons_not_excluded_after_stage_1 = {};
    let persons_not_excluded_final = {};

    let organized = {
        counts: {
            send: 0,
            receive: 0,
            interests: 0,
            excluded: 0
        },
        matches: {
            send: [],
            receive: []
        }
    };

    function processStage1() {
        return new Promise(async (resolve, reject) => {
            try {
                let t = timeNow();

                await getGridTokens();

                console.log({
                    grid_tokens: timeNow() - t
                });

                t = timeNow();

                await getGridPersonTokens();

                console.log({
                    total_initial_persons: Object.keys(person_tokens).length
                });

                console.log({
                    person_tokens: timeNow() - t
                });

                t = timeNow();

                await filterOnlineStatus();

                console.log({
                    after_online_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    online: timeNow() - t
                });

                t = timeNow();

                await filterAvailability();

                console.log({
                    availability: timeNow() - t
                });

                console.log({
                    after_availability_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                await filterNetworks();

                console.log({
                    after_networks_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    networks: timeNow() - t
                });

                t = timeNow();

                await filterModes();

                console.log({
                    after_modes_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    modes: timeNow() - t
                });

                t = timeNow();

                await filterVerifications();

                console.log({
                    after_verifications_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    verifications: timeNow() - t
                });

                t = timeNow();

                await filterAge();

                console.log({
                    after_age_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    age: timeNow() - t
                });

                t = timeNow();

                await filterGenders();

                console.log({
                    after_genders_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    genders: timeNow() - t
                });

                t = timeNow();

                await filterSection('life_stages', getLifeStages, true);

                console.log({
                    after_life_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    life: timeNow() - t
                });

                t = timeNow();

                await filterSection('relationships', getRelationshipStatus, true);

                console.log({
                    after_relationships_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    relationships: timeNow() - t
                });

                t = timeNow();

                await filterSection('politics', getPolitics, false);

                console.log({
                    after_politics_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    politics: timeNow() - t
                });

                t = timeNow();

                await filterSection('religion', getReligions, true);

                console.log({
                    after_religions_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    religions: timeNow() - t
                });

                t = timeNow();

                await filterSection('drinking', getDrinking, false);

                console.log({
                    drinking: timeNow() - t
                });

                console.log({
                    after_drinking_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                t = timeNow();

                await filterSection('smoking', getSmoking, false);

                console.log({
                    smoking: timeNow() - t
                });

                console.log({
                    after_smoking_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });    
                
                return resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }       
        });
    }

    function filterPersonsAfterStage1() {
        for(let person_token in person_tokens) {
            let included = false;

            if(!(person_token in exclude.send)) {
                included = true;
            }

            //if I'm offline or unavailable, exclude receiving from all
            if(!am_online || !am_available) {
                exclude.receive[person_token] = true;
            } else {
                //allow receiving notifications if not excluded
                if(!(person_token in exclude.receive)) {
                    included = true;
                }
            }

            if(included) {
                persons_not_excluded_after_stage_1[person_token] = true;
            } else {
                organized.counts.excluded++;
            }
        }
    }

    function processStage2() {
        return new Promise(async (resolve, reject) => {

            try {
                let t = timeNow();

                //get data for up to 1,000 not excluded persons
                let pipeline = cacheService.startPipeline();

                let persons_keys = Object.keys(persons_not_excluded_after_stage_1);

                if(persons_keys.length > MAX_PERSONS_PROCESS) {
                    persons_keys = shuffleFunc(persons_keys);
                    persons_keys = persons_keys.slice(0, MAX_PERSONS_PROCESS);
                }

                for(let person_token of persons_keys) {
                    let person_key = cacheService.keys.person(person_token);
                    let person_filters_key = cacheService.keys.person_filters(person_token);

                    pipeline.get(person_key);
                    pipeline.get(person_filters_key);
                }

                let results = await cacheService.execPipeline(pipeline);

                console.log({
                    stage_2_pipeline: timeNow() - t
                });

                let t2 = timeNow();

                let idx = 0;

                for(let i = 0; i < persons_keys.length; i++) {
                    let person_token = persons_keys[i];

                    try {
                        let data = results[idx++];

                        if(data) {
                            data = JSON.parse(data);
                        }

                        let filters = results[idx++];

                        if(filters) {
                            filters = JSON.parse(filters);
                        }

                        selected_persons_data[person_token] = {
                            data: data,
                            filters: filters,
                            sections: null
                        }
                    } catch(e) {
                        console.error(e);
                    }
                }

                console.log({
                    stage_2_parse: timeNow() - t2
                });

                let t3 = timeNow();

                await filterPersonsAvailability();

                console.log({
                    stage_2_availability: timeNow() - t3
                });

                results = null;
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    }

    function getGridTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                let my_grid_token = me.grid?.token;

                if (!my_grid_token) {
                    return reject('Grid token required');
                }

                neighbor_grid_tokens.push(my_grid_token);

                let max_distance = DEFAULT_DISTANCE_MILES;

                if (my_filters.distance?.is_active &&
                    my_filters.distance.filter_value) {

                    if(my_filters.distance.is_send && my_filters.distance.is_receive) {
                        max_distance = my_filters.distance.filter_value;
                    } else if(my_filters.distance.is_send || my_filters.distance.is_receive) {
                        max_distance = Math.max(my_filters.distance.filter_value, DEFAULT_DISTANCE_MILES);
                    }
                }

                max_distance *= kms_per_mile;

                let grids = await gridService.findNearby(me.location_lat, me.location_lon, max_distance);

                for(let grid of grids) {
                    if (!neighbor_grid_tokens.includes(grid.token)) {
                        neighbor_grid_tokens.push(grid.token);
                    }
                }

                resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function getGridPersonTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                let pipeline_persons = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_persons.sMembers(
                        cacheService.keys.persons_grid_set(grid_token, 'location')
                    );
                }

                let results_persons = await cacheService.execPipeline(pipeline_persons);

                for (let grid_persons of results_persons) {
                    for (let token of grid_persons) {
                        person_tokens[token] = true;
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
                let pipeline_offline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_offline.sMembers(
                        cacheService.keys.persons_grid_exclude(grid_token, 'online')
                    );
                }

                let results_offline = await cacheService.execPipeline(pipeline_offline);

                for (let grid of results_offline) {
                    for (let token of grid) {
                        exclude.send[token] = true;
                        exclude.receive[token] = true;
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    function filterAvailability() {
        return new Promise(async (resolve, reject) => {
            //todo day of week based on if activity date/start time provided

            //filter send
            let day_of_week = new Date().getDay();

            let pipeline = cacheService.startPipeline();

            for (let grid_token of neighbor_grid_tokens) {
                pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                    grid_token,
                    `availability:day:${day_of_week}`,
                    'receive'
                ));
            }

            try {
                let results = await cacheService.execPipeline(pipeline);

                for(let persons of results) {
                    for(let person_token of persons) {
                        exclude.send[person_token] = true;
                    }
                }
            } catch(e) {
                console.error(e);
            }

            //filter receive
            am_available = isPersonAvailable(me, my_filters.availability);

            console.log({
                am_available
            });

            resolve();
        });
    }

    function filterNetworks() {
        //send
        // if filter is off, match with anybody that:
        // 1) is on the same network
        // 2) receiving person has their networks filter disabled
        // 3) has their receive notifications filter disabled
        // 4) has any network selected
        // 5) has verified networks selected and both are on verified networks
        // 6) this person's network is in receiving person's list of allowed networks
        // if filter is on and send is on, match with anybody that:
        // 7) is on the same network
        // 8) if this person any network selected, any receiving person that has their networks filter or receive filter disabled or any network selected
        // 9) if verified networks selected, any receiving person that has their networks filter or receive filter disabled and is on a verified network
        // 10) if verified networks selected, any receiving person that is on a verified network and has verified networks selected
        // 11) if verified networks selected, any receiving person that is on a verified network and has this person's network in their list of allowed networks
        // 12) if specific networks selected, any receiving person that is in the list of networks selected and matches the following conditions:
        // a) receiving person has their networks filter or receive filter disabled or has any network selected
        // b) receiving person has verified networks selected and this person's network is verified

        //receive
        // if filter is off, match with anybody that:
        // 1) is on the same network
        // 2) sending person has their networks filter disabled
        // 3) sending person has their send filter disabled
        // 4) sending person has any network selected
        // 5) sending person has verified networks selected and both are on verified networks
        // 6) sending person has this person's network in their list of allowed networks
        // if filter is on and receive is on, match with anybody that:
        // 7) both have any network selected
        // 8) both have verified network selected and both are on verified networks
        // 9) if sending person has send on:
        // a) if sending person has verified networks selected and this person is on a verified network and this person has sending person's network in their list of networks
        // b) if sending person has this person's network in their list of allowed networks and this person has the sending person's network in their allowed list of networks
        // 10) if sending person has send off:
        // a) if receiving person has verified networks selected and sending person is on a verified network
        // b) if receiving person has specific networks selected and sending person's network matches

        return new Promise(async (resolve, reject) => {
            try {
                let allNetworks = await getNetworksForFilters();
                let network_token = allNetworks.networks?.find(network => network.id === me.network_id)?.network_token;

                if(!network_token) {
                    return resolve();
                }

                let pipeline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network_token}`, 'send'));

                    pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network_token}`, 'receive'));
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                for(let grid_token of neighbor_grid_tokens) {
                    let personsExcludeSend = results[idx++];
                    let personsExcludeReceive = results[idx++];

                    for(let token of personsExcludeSend) {
                        exclude.receive[token] = true;
                    }

                    for(let token of personsExcludeReceive) {
                        exclude.send[token] = true;
                    }
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
            try {
                // Get all modes, not just excluded ones
                let modeTypes = Object.values((await getModes())?.byId);
                let excluded_modes = await getPersonExcludedModes(me, my_filters);
                let included_modes = {
                    send: [],
                    receive: []
                };

                for(let mode of modeTypes) {
                    if(!excluded_modes.send.has(mode.token)) {
                        included_modes.send.push(mode.token);
                    }

                    if(!excluded_modes.receive.has(mode.token)) {
                        included_modes.receive.push(mode.token);
                    }
                }

                let pipeline = cacheService.startPipeline();

                // Check all modes for send
                for(let mode of modeTypes) {
                    for (let grid_token of neighbor_grid_tokens) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode.token}`,
                            'send'
                        ));
                    }
                }

                // Check all modes for receive
                for(let mode of modeTypes) {
                    for(let grid_token of neighbor_grid_tokens) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode.token}`,
                            'receive'
                        ));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                let personsExcludeModesSend = {};
                let personsExcludeModesReceive = {};

                // Process send results
                for(let mode of modeTypes) {
                    personsExcludeModesSend[mode.token] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let excludeSend = results[idx++];

                        for (let token of excludeSend) {
                            personsExcludeModesSend[mode.token][token] = true;
                        }
                    }
                }

                // Process receive results
                for(let mode of modeTypes) {
                    personsExcludeModesReceive[mode.token] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let excludeReceive = results[idx++];

                        for (let token of excludeReceive) {
                            personsExcludeModesReceive[mode.token][token] = true;
                        }
                    }
                }

                for(let token in person_tokens) {
                    //send
                    let hasSendModeMatch = false;

                    for(let includedMode of included_modes.send) {
                        // If not excluded from receiving
                        if(!(token in personsExcludeModesReceive[includedMode])) {
                            hasSendModeMatch = true;
                            break;
                        }
                    }

                    if(!hasSendModeMatch) {
                        exclude.send[token] = true;
                    }

                    //receive
                    let hasReceiveModeMatch = false;

                    for(let includedMode of included_modes.receive) {
                        // If not excluded from sending
                        if(!(token in personsExcludeModesSend[includedMode])) {
                            hasReceiveModeMatch = true;
                            break;
                        }
                    }

                    if(!hasReceiveModeMatch) {
                        exclude.receive[token] = true;
                    }
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
            try {
                const verificationTypes = ['in_person', 'linkedin'];

                let pipeline = cacheService.startPipeline();

                // Get all verification data for each grid token and type
                for(let type of verificationTypes) {
                    for(let grid_token of neighbor_grid_tokens) {
                        // Get verified persons
                        pipeline.sMembers(cacheService.keys.persons_grid_set(grid_token, `verified:${type}`));

                        // Get send/receive filter states
                        pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, `verifications:${type}`, 'send'));
                        pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, `verifications:${type}`, 'receive'));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let verifiedPersons = {};
                let sendVerification = {};
                let receiveVerification = {};

                // Process pipeline results
                for (let type of verificationTypes) {
                    verifiedPersons[type] = {};
                    sendVerification[type] = {};
                    receiveVerification[type] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let verified_tokens = results[idx++];
                        let send_tokens = results[idx++];
                        let receive_tokens = results[idx++];

                        // Track verified persons
                        for (let token of verified_tokens) {
                            verifiedPersons[type][token] = true;
                        }
                        // Track send filter states
                        for (let token of send_tokens) {
                            sendVerification[type][token] = true;
                        }
                        // Track receive filter states
                        for (let token of receive_tokens) {
                            receiveVerification[type][token] = true;
                        }
                    }
                }

                for(let token in person_tokens) {
                    for(let type of verificationTypes) {
                        if(me[`is_verified_${type}`]) {
                            //if filter enabled
                            if(my_filters.verifications?.is_active && my_filters[`verification_${type}`]?.is_active) {
                                if(my_filters[`verification_${type}`].is_send) {
                                    //send to verified only
                                    if(!verifiedPersons[type][token]) {
                                        exclude.send[token] = true;
                                    }
                                }

                                if(my_filters[`verification_${type}`].is_receive) {
                                    //receive from verified only
                                    if(!verifiedPersons[type][token]) {
                                        exclude.receive[token] = true;
                                    }
                                }
                            } else {
                                //send/receive from anybody
                            }
                        } else {
                            //exclude from sending/receiving if person is verified and requires verification
                            if(token in verifiedPersons[type]) {
                                if(token in receiveVerification[type]) {
                                    exclude.send[token] = true;
                                }

                                if(token in sendVerification[type]) {
                                    exclude.receive[token] = true;
                                }
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterVerifications:', e);
                reject(e);
            }
        });
    }

    function filterAge() {
        return new Promise(async (resolve, reject) => {
            try {
                let pipeline = cacheService.startPipeline();

                for(let grid_token of neighbor_grid_tokens) {
                    pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, `age`, 'send'));
                    pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, `age`, 'receive'));
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                resolve();
            } catch (e) {
                console.error('Error in filterVerifications:', e);
                reject(e);
            }
        });
    }

    function filterGenders() {
        return new Promise(async (resolve, reject) => {
            //bi-directional gender filtering
            try {
                let gendersLookup = await getGendersLookup();

                let pipeline = cacheService.startPipeline();

                let myGender = gendersLookup.byId[me?.gender_id]?.gender_token;

                for (let grid_token of neighbor_grid_tokens) {
                    // Get all gender set members
                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            pipeline.sMembers(cacheService.keys.persons_grid_set(
                                grid_token,
                                `gender:${token}`
                            ));
                        }
                    }

                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `genders:${token}`,
                                'send'
                            ));
                            pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `genders:${token}`,
                                'receive'
                            ));
                        }
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let genderSets = {};
                let personsExcludeSend = {};
                let personsExcludeReceive = {};

                // Process pipeline results
                for (let grid_token of neighbor_grid_tokens) {
                    // Process gender set memberships
                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            if (!genderSets[token]) {
                                genderSets[token] = {};
                            }

                            let members = results[idx++];

                            for (let member of members) {
                                genderSets[token][member] = true;
                            }
                        }
                    }

                    // Process gender exclusions
                    for (let gender_token in gendersLookup.byToken) {
                        if (gender_token !== 'any') {
                            if (!personsExcludeSend[gender_token]) {
                                personsExcludeSend[gender_token] = {};
                            }
                            if (!personsExcludeReceive[gender_token]) {
                                personsExcludeReceive[gender_token] = {};
                            }

                            // Send exclusions
                            let sendExclusions = results[idx++];

                            for (let token of sendExclusions) {
                                personsExcludeSend[gender_token][token] = true;
                            }

                            // Receive exclusions
                            let receiveExclusions = results[idx++];

                            for (let token of receiveExclusions) {
                                personsExcludeReceive[gender_token][token] = true;
                            }
                        }
                    }
                }

                //if gender not set, exclude for all excluded
                if(!myGender) {
                    for(let gender_token in personsExcludeReceive) {
                        let tokens = personsExcludeReceive[gender_token];

                        for(let token in tokens) {
                            exclude.send[token] = true;
                        }
                    }

                    for(let gender_token in personsExcludeSend) {
                        let tokens = personsExcludeSend[gender_token];

                        for(let token in tokens) {
                            exclude.receive[token] = true;
                        }
                    }
                } else {
                    // Process each person token
                    for (let token in person_tokens) {
                        // Get person's gender
                        let personGender = null;

                        for (let genderToken in genderSets) {
                            if (genderSets[genderToken][token]) {
                                personGender = genderToken;
                                break;
                            }
                        }

                        // Exclude send if person has excluded my gender or I have excluded the person's gender
                        if (token in personsExcludeReceive[myGender] || my_token in personsExcludeSend[personGender]) {
                            exclude.send[token] = true;
                        }

                        // Exclude receive if person has excluded my gender or I have excluded the person's gender
                        if (token in personsExcludeSend[myGender] || my_token in personsExcludeReceive[personGender]) {
                            exclude.receive[token] = true;
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterGenders:', e);
                reject(e);
            }
        });
    }

    function filterSection(sectionKey, getOptions, isMultiSelect) {
        return new Promise(async (resolve, reject) => {
            try {
                let options = await getOptions();
                let sectionDataKey = cacheService.keys.persons_section_data(my_token, sectionKey);
                let sectionData = (await cacheService.getObj(sectionDataKey)) || {};

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
                        // Get persons with this option
                        pipeline.sMembers(cacheService.keys.persons_grid_set(
                            grid_token,
                            `${sectionKey}:${option.token}`
                        ));
                    }

                    // Get excluded send/receive states
                    for (let option of options) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'send'
                        ));

                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'receive'
                        ));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let optionSets = {};
                let excludeSend = {};
                let excludeReceive = {};

                // Process pipeline results for each grid
                for (let grid_token of neighbor_grid_tokens) {
                    // Process option set memberships
                    for (let option of options) {
                        if (!optionSets[option.token]) {
                            optionSets[option.token] = {};
                        }

                        let members = results[idx++];
                        for (let member of members) {
                            optionSets[option.token][member] = true;
                        }
                    }

                    // Process exclusions
                    for (let option of options) {
                        if (!excludeSend[option.token]) {
                            excludeSend[option.token] = {};
                        }
                        if (!excludeReceive[option.token]) {
                            excludeReceive[option.token] = {};
                        }

                        // Send exclusions
                        let sendExclusions = results[idx++];
                        for (let token of sendExclusions) {
                            excludeSend[option.token][token] = true;
                        }

                        // Receive exclusions
                        let receiveExclusions = results[idx++];
                        for (let token of receiveExclusions) {
                            excludeReceive[option.token][token] = true;
                        }
                    }
                }

                // If no options set, handle exclusions
                if (myOptionTokens.size === 0) {
                    for (let optionToken in excludeReceive) {
                        for (let token in excludeReceive[optionToken]) {
                            exclude.send[token] = true;
                        }
                    }

                    for (let optionToken in excludeSend) {
                        for (let token in excludeSend[optionToken]) {
                            exclude.receive[token] = true;
                        }
                    }

                    return resolve();
                }

                // Process each person token
                for (let token in person_tokens) {
                    let personOptionTokens = new Set();

                    // Find all options for this person
                    for (let optionToken in optionSets) {
                        if (optionSets[optionToken][token]) {
                            personOptionTokens.add(optionToken);
                        }
                    }

                    if (personOptionTokens.size === 0) {
                        // Exclude sending/receiving if filter specified (with importance)
                        for (let k in excludeSend) {
                            if (my_token in excludeSend[k]) {
                                exclude.send[token] = true;
                                break;
                            }
                        }

                        for (let k in excludeReceive) {
                            if (my_token in excludeReceive[k]) {
                                exclude.receive[token] = true;
                                break;
                            }
                        }
                    } else if (isMultiSelect) {
                        // Check bi-directional exclusions for multi-select
                        let shouldExcludeSend = true;
                        let shouldExcludeReceive = true;

                        // For each of my options
                        for (let myOption of myOptionTokens) {
                            // For each of their options
                            for (let theirOption of personOptionTokens) {
                                // Check if they accept my option and I accept theirs
                                if (!(token in excludeReceive[myOption]) &&
                                    !(my_token in excludeSend[theirOption])) {
                                    shouldExcludeSend = false;
                                }

                                if (!(token in excludeSend[myOption]) &&
                                    !(my_token in excludeReceive[theirOption])) {
                                    shouldExcludeReceive = false;
                                }
                            }
                        }

                        if (shouldExcludeSend) {
                            exclude.send[token] = true;
                        }
                        if (shouldExcludeReceive) {
                            exclude.receive[token] = true;
                        }
                    } else {
                        // Handle single-select exclusions
                        let personOption = Array.from(personOptionTokens)[0];
                        let myOption = Array.from(myOptionTokens)[0];

                        // Exclude send/receive if person has excluded my option or I have excluded their option
                        if (token in excludeReceive[myOption] ||
                            my_token in excludeSend[personOption]) {
                            exclude.send[token] = true;
                        }

                        if (token in excludeSend[myOption] ||
                            my_token in excludeReceive[personOption]) {
                            exclude.receive[token] = true;
                        }
                    }
                }
            } catch (e) {
                console.error(`Error in filterSection for ${sectionKey}:`, e);
                return reject(e);
            }

            resolve();
        });
    }

    function filterPersonsAvailability() {
        return new Promise(async (resolve, reject) => {
            try {
                for (let person_token in selected_persons_data) {
                    const person = selected_persons_data[person_token].data;
                    const filters = selected_persons_data[person_token].filters;

                    let is_available = isPersonAvailable(person, filters);

                    if(!is_available) {
                        exclude.send[person_token] = true;
                    }
                }

                resolve();
            } catch (error) {
                console.error('Error in filterPersonsAvailability:', error);
                reject(error);
            }
        });
    }

    function organizeFinal() {
        for(let person_token in persons_not_excluded_after_stage_1) {
            let included = false;

            if(!(person_token in exclude.send)) {
                organized.counts.send++;
                included = true;
            }

            //if my online status is set to offline, exclude receiving from all
            if(!me.is_online) {
                exclude.receive[person_token] = true;
            } else {
                //allow receiving notifications if not excluded
                if(!(person_token in exclude.receive)) {
                    organized.counts.receive++;
                    included = true;
                }
            }

            if(included) {
                persons_not_excluded_final[person_token] = true;
            } else {
                organized.counts.excluded++;
            }
        }

        //decrease exclude by one to not include self in count
        if(my_token in exclude.send) {
            organized.counts.excluded--;
        }
    }

    return new Promise(async (resolve, reject) => {
        let ts = timeNow();
        let memory_start = process.memoryUsage().heapTotal / 1024 / 1024;

        try {
            if (!me) {
                return reject("Person required");
            }

            my_token = me.person_token;

            //exclude sending/receiving to/from self
            exclude.send[my_token] = true;
            exclude.receive[my_token] = true;

            let t = timeNow();

            my_filters = await getPersonFilters(me);

            console.log({
                my_filters: timeNow() - t
            });
            
            await processStage1();

            console.log({
                stage_1: timeNow() - t
            });

            t = timeNow();

            filterPersonsAfterStage1();

            console.log({
                filter_persons: timeNow() - t
            });

            t = timeNow();

            await processStage2();

            console.log({
                stage_2: timeNow() - t
            });

            t = timeNow();

            organizeFinal();

            console.log({
                not_excluded: timeNow() - t
            });

            let memory_end = process.memoryUsage().heapTotal / 1024 / 1024;

            console.log({
                memory_start,
                memory_end
            });

            console.log({
                final_persons: Object.keys(persons_not_excluded_final).length
            });

            neighbor_grid_tokens = null;
            person_tokens = null;
            selected_persons_data = null;

            exclude = null;
            persons_not_excluded_after_stage_1 = null;
            persons_not_excluded_final = null;

            if(counts_only) {
                return resolve(organized);
            }

            resolve(organized);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

module.exports = {
    getMatches
}