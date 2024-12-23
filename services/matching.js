let cacheService = require('../services/cache');
let dbService = require('../services/db');
let gridService = require('../services/grid');

const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow } = require('./shared');
const { getNetworksForFilters } = require('./network');
const { getModes } = require('./modes');

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
                let networksFilter = person_filters.networks;
                let sendMatches = {};
                let receiveMatches = {};

                // Get networks data
                let allNetworks = await getNetworksForFilters();
                let network_token = allNetworks.networks?.find(network => network.id === person.network_id)?.network_token;

                if(!network_token) {
                    return resolve();
                }

                let pipeline = cacheService.startPipeline();

                // Get all potential matches from grid tokens
                for (let grid_token of neighbor_grid_tokens) {
                    // Get any network send/receive
                    pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'send'));
                    pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'receive'));

                    // Get own network matches
                    pipeline.sMembers(cacheService.keys.persons_grid_set(grid_token, `networks:${network_token}`));
                }

                let results = await cacheService.execPipeline(pipeline);

                let sendAnyPersons = {};
                let receiveAnyPersons = {};
                let sameNetworkPersons = {};

                for(let i = 0; i < results.length; i++) {
                    let result = results[i];

                    if(i % 3 === 0) {
                        for(let token of result) {
                            sendAnyPersons[token] = true;
                        }
                    } else if(i % 3 === 1) {
                        for(let token of result) {
                            receiveAnyPersons[token] = true;
                        }
                    } else if(i % 3 === 2) {
                        for(let token of result) {
                            sameNetworkPersons[token] = true;
                        }
                    }
                }

                // Add to send/receive matches
                // Always allow when on same network
                for(let token in sameNetworkPersons) {
                    sendMatches[token] = true;
                    receiveMatches[token] = true;
                }

                if(!networksFilter?.is_active) {
                    for(let token in receiveAnyPersons) {
                        sendMatches[token] = true;
                    }

                    for(let token in sendAnyPersons) {
                        receiveMatches[token] = true;
                    }
                } else {
                    if(!networksFilter.is_send) {
                        for(let token in receiveAnyPersons) {
                            sendMatches[token] = true;
                        }
                    }

                    if(!networksFilter.is_receive) {
                        for(let token in sendAnyPersons) {
                            receiveMatches[token] = true;
                        }
                    }
                }

                // Update excluded
                for(let token in person_tokens) {
                    if(!sendMatches[token]) {
                        exclude.send[token] = true;
                    }

                    if(!receiveMatches[token]) {
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
                let sendMatches = {};
                let receiveMatches = {};

                // Get modes data
                let personModes = person.modes;
                let personSelectedModes = personModes?.selected || [];
                let modes = await getModes();
                let modesFilter = person_filters.modes;

                let pipeline = cacheService.startPipeline();

                for(let mode of personSelectedModes) {
                    for (let grid_token of neighbor_grid_tokens) {
                        pipeline.sMembers(cacheService.keys.persons_grid_set(grid_token, `modes:${mode}`));
                        pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, mode, 'send'));
                        pipeline.sMembers(cacheService.keys.persons_grid_send_receive(grid_token, mode, 'receive'));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let modesPersonTokens = {};
                let sendMode = {};
                let receiveMode = {};

                for(let mode of personSelectedModes) {
                    modesPersonTokens[mode] = {};
                    sendMode[mode] = {};
                    receiveMode[mode] = {};

                    for (let grid_token of neighbor_grid_tokens) {
                        let person_tokens = results[idx++];
                        let send_tokens = results[idx++];
                        let receive_tokens = results[idx++];

                        for(let token of person_tokens) {
                            modesPersonTokens[mode][token] = true
                        }

                        for(let token of send_tokens) {
                            sendMode[mode][token] = true
                        }

                        for(let token of receive_tokens) {
                            receiveMode[mode][token] = true
                        }
                    }
                }

                if (!modesFilter?.is_active) {
                    // If filter is off, use all modes for both send and receive
                    for (let mode of personSelectedModes) {
                        for (let token in modesPersonTokens[mode]) {
                            if(sendMode[mode][token]) {
                                sendMatches[token] = true;
                            }

                            if(receiveMode[mode][token]) {
                                receiveMatches[token] = true;
                            }
                        }
                    }
                } else {
                    // Get active filter modes (non-negative, non-deleted)
                    const activeFilterModes = Object.values(modesFilter.items || {})
                        .filter(item => item.is_active && !item.is_negative && !item.deleted)
                        .map(item => modes.byId[item.mode_id]?.token)
                        .filter(Boolean);

                    // Handle send matches
                    if (!modesFilter.is_send) {
                        // If send is disabled, use all selected modes for send matches
                        for (let mode of personSelectedModes) {
                            for (let token in modesPersonTokens[mode]) {
                                if (sendMode[mode][token]) {
                                    sendMatches[token] = true;
                                }
                            }
                        }
                    } else {
                        // If send is enabled, only use modes that are in both selected modes and filter modes
                        for (let mode of personSelectedModes) {
                            if (activeFilterModes.includes(mode)) {
                                for (let token in modesPersonTokens[mode]) {
                                    if (sendMode[mode][token]) {
                                        sendMatches[token] = true;
                                    }
                                }
                            }
                        }
                    }

                    // Handle receive matches
                    if (!modesFilter.is_receive) {
                        // If receive is disabled, use all selected modes for receive matches
                        for (let mode of personSelectedModes) {
                            for (let token in modesPersonTokens[mode]) {
                                if (receiveMode[mode][token]) {
                                    receiveMatches[token] = true;
                                }
                            }
                        }
                    } else {
                        // If receive is enabled, only use modes that are in both selected modes and filter modes
                        for (let mode of personSelectedModes) {
                            if (activeFilterModes.includes(mode)) {
                                for (let token in modesPersonTokens[mode]) {
                                    if (receiveMode[mode][token]) {
                                        receiveMatches[token] = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // Update excluded sets based on matches
                for (let token in person_tokens) {
                    if (!sendMatches[token]) {
                        exclude.send[token] = true;
                    }

                    if (!receiveMatches[token]) {
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