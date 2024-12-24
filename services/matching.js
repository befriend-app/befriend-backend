let cacheService = require('../services/cache');
let dbService = require('../services/db');
let gridService = require('../services/grid');

const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow } = require('./shared');
const { getNetworksForFilters } = require('./network');
const { getModes, getPersonExcludedModes } = require('./modes');
const { getGendersLookup } = require('./genders');

const DEFAULT_DISTANCE_MILES = 20;

function getMatches(person, activity_type = null) {
    let person_filters;
    let neighbor_grid_tokens = [];
    let person_tokens = {};
    let online_person_tokens = {};

    let exclude = {
        send: {},
        receive: {}
    };

    let matches = {
        send: [],
        receive: []
    };

    function getGridTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                let person_grid_token = person.grid?.token;

                if (!person_grid_token) {
                    return reject('Grid token required');
                }

                neighbor_grid_tokens.push(person_grid_token);

                let max_distance = DEFAULT_DISTANCE_MILES;

                if (person_filters.distance?.is_active &&
                    person_filters.distance.is_send &&
                    person_filters.distance.filter_value) {
                    max_distance = person_filters.distance.filter_value;
                }
                max_distance *= kms_per_mile;

                let grids = await gridService.findNearby(person.location_lat, person.location_lon, max_distance);

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

    let onlineTime = {redis: 0, loops: 0};

    function filterOnlineStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                let pipeline_online = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_online.sMembers(
                        cacheService.keys.persons_grid_set(grid_token, 'online')
                    );
                }

                let t = timeNow();

                let results_online = await cacheService.execPipeline(pipeline_online);

                onlineTime.redis += timeNow() - t;

                let t2 = timeNow();

                for (let grid of results_online) {
                    for (let token of grid) {
                        online_person_tokens[token] = true;
                    }
                }

                for (let token in person_tokens) {
                    if (!online_person_tokens[token]) {
                        exclude.send[token] = true;
                        exclude.receive[token] = true;
                    }
                }

                onlineTime.loops += timeNow() - t2;

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
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
                let network_token = allNetworks.networks?.find(network => network.id === person.network_id)?.network_token;

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
                    let excludeSend = results[idx++];
                    let excludeReceive = results[idx++];

                    for(let token of excludeSend) {
                        exclude.send[token] = true;
                    }

                    for(let token of excludeReceive) {
                        exclude.receive[token] = true;
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
                let excluded_modes = await getPersonExcludedModes(person, person_filters);
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

                let excludeModesSend = {};
                let excludeModesReceive = {};

                // Process send results
                for(let mode of modeTypes) {
                    excludeModesSend[mode.token] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let excludeSend = results[idx++];

                        for (let token of excludeSend) {
                            excludeModesSend[mode.token][token] = true;
                        }
                    }
                }

                // Process receive results
                for(let mode of modeTypes) {
                    excludeModesReceive[mode.token] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let excludeReceive = results[idx++];

                        for (let token of excludeReceive) {
                            excludeModesReceive[mode.token][token] = true;
                        }
                    }
                }

                for(let token in person_tokens) {
                    //send
                    let hasSendModeMatch = false;

                    for(let includedMode of included_modes.send) {
                        // If not excluded from receiving
                        if(!(token in excludeModesReceive[includedMode])) {
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
                        if(!(token in excludeModesSend[includedMode])) {
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
                        if(person[`is_verified_${type}`]) {
                            //if filter enabled
                            if(person_filters.verifications?.is_active && person_filters[`verification_${type}`]?.is_active) {
                                if(person_filters[`verification_${type}`].is_send) {
                                    //send to verified only
                                    if(!verifiedPersons[type][token]) {
                                        exclude.send[token] = true;
                                    }
                                }

                                if(person_filters[`verification_${type}`].is_receive) {
                                    //receive from verified only
                                    if(!verifiedPersons[type][token]) {
                                        exclude.receive[token] = true;
                                    }
                                }
                            } else {
                                //send/receive from anybody
                            }
                        } else {
                            //exclude from sending if token in verified and receive
                            if(token in verifiedPersons[type] && token in receiveVerification[type]) {
                                exclude.send[token] = true;
                            }

                            //exclude from receiving if token in verified and send
                            if(token in verifiedPersons[type] && token in sendVerification[type]) {
                                exclude.receive[token] = true;
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
            try {
                // Get genders data
                let gendersLookup = await getGendersLookup();

                // For each grid token, get gender sets
                let pipeline = cacheService.startPipeline();

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

                    // Get excluded gender send/receive preferences
                    for (let token in gendersLookup.byToken) {
                        if (token !== 'any') {
                            pipeline.sMembers(cacheService.keys.persons_grid_exclude(
                                grid_token,
                                `genders:${token}`,
                                'send'
                            ));
                            pipeline.sMembers(cacheService.keys.persons_grid_exclude(
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
                let genderExcludeSend = {};
                let genderExcludeReceive = {};

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
                            if (!genderExcludeSend[gender_token]) {
                                genderExcludeSend[gender_token] = {};
                            }
                            if (!genderExcludeReceive[gender_token]) {
                                genderExcludeReceive[gender_token] = {};
                            }

                            // Send exclusions
                            let sendExclusions = results[idx++];
                            for (let token of sendExclusions) {
                                genderExcludeSend[gender_token][token] = true;
                            }

                            // Receive exclusions
                            let receiveExclusions = results[idx++];
                            for (let token of receiveExclusions) {
                                genderExcludeReceive[gender_token][token] = true;
                            }
                        }
                    }
                }

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

                    // Check send permissions
                    if (!personGender || token in genderExcludeReceive[personGender]) {
                        exclude.send[token] = true;
                    }

                    // Check receive permissions
                    if (!personGender || token in genderExcludeSend[personGender]) {
                        exclude.receive[token] = true;
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterGenders:', e);
                reject(e);
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!person) {
                return reject("Person required");
            }

            let memory_start = process.memoryUsage().heapTotal / 1024 / 1024;

            let t1 = timeNow();
            person_filters = await getPersonFilters(person);

            console.log({
                person_filters: timeNow() - t1
            });

            let t2 = timeNow();

            await getGridTokens();

            let memory_end = process.memoryUsage().heapTotal / 1024 / 1024;

            console.log({
                grid_tokens: timeNow() - t2
            });

            let t3 = timeNow();
            await getGridPersonTokens();

            console.log({
                person_tokens: timeNow() - t3
            });

            let t4 = timeNow();

            console.log({
                mass_pipeline: timeNow() - t3
            });

            console.log({
                memory_start,
                memory_end
            });

            // let t4 = timeNow();
            await filterOnlineStatus();

            console.log({
                online: timeNow() - t4
            });

            let t5 = timeNow();
            await filterNetworks();

            console.log({
                networks: timeNow() - t5
            });

            let t6 = timeNow();
            await filterModes();

            console.log({
                modes: timeNow() - t6
            });

            let t7 = timeNow();

            await filterVerifications();

            console.log({
                verifications: timeNow() - t7
            });

            let t8 = timeNow();

            await filterAge();

            console.log({
                age: timeNow() - t8
            });

            let t9 = timeNow();

            await filterGenders();

            console.log({
                genders: timeNow() - t9
            });

            // let memory_end = process.memoryUsage().heapTotal / 1024 / 1024;

            console.log({
                memory_start,
                memory_end
            });

            resolve();
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

module.exports = {
    getMatches
}