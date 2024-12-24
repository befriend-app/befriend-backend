let cacheService = require('../services/cache');
let dbService = require('../services/db');
let gridService = require('../services/grid');

const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow } = require('./shared');
const { getNetworksForFilters } = require('./network');
const { getModes, getPersonExcludedModes } = require('./modes');
const { getGendersLookup } = require('./genders');
const { getDrinking } = require('./drinking');
const { getSmoking } = require('./smoking');
const { getLifeStages } = require('./life_stages');

const DEFAULT_DISTANCE_MILES = 20;

function getMatches(me, location = null, activity_type = null) {
    let my_filters, my_token;
    let neighbor_grid_tokens = [];
    let person_tokens = {};

    let exclude = {
        send: {},
        receive: {}
    };

    let persons_not_excluded = {};

    let matches = {
        send: [],
        receive: []
    };

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
                    my_filters.distance.is_send &&
                    my_filters.distance.filter_value) {
                    max_distance = my_filters.distance.filter_value;
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

                let t = timeNow();

                let results_offline = await cacheService.execPipeline(pipeline_offline);

                let t2 = timeNow();

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

                    // Get excluded gender send/receive preferences
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

                //if gender not set, exclude for all excluded
                if(!myGender) {
                    for(let gender_token in genderExcludeReceive) {
                        let tokens = genderExcludeReceive[gender_token];

                        for(let token in tokens) {
                            exclude.send[token] = true;
                        }
                    }

                    for(let gender_token in genderExcludeSend) {
                        let tokens = genderExcludeSend[gender_token];

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
                        if (token in genderExcludeReceive[myGender] || my_token in genderExcludeSend[personGender]) {
                            exclude.send[token] = true;
                        }

                        // Exclude receive if person has excluded my gender or I have excluded the person's gender
                        if (token in genderExcludeSend[myGender] || my_token in genderExcludeReceive[personGender]) {
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

    function filterLifeStages() {
        return new Promise(async (resolve, reject) => {
            try {
                let lifeStageOptions = await getLifeStages();
                let section_key = cacheService.keys.persons_section_data(my_token, 'life_stages');
                let section_data = (await cacheService.getObj(section_key)) || {};

                let pipeline = cacheService.startPipeline();

                let myLifeStageTokens = new Set();
                for (let key in section_data) {
                    myLifeStageTokens.add(section_data[key].token);
                }

                for (let grid_token of neighbor_grid_tokens) {
                    for (let option of lifeStageOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_set(
                            grid_token,
                            `life_stages:${option.token}`
                        ));
                    }

                    for (let option of lifeStageOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `life_stages:${option.token}`,
                            'send'
                        ));
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `life_stages:${option.token}`,
                            'receive'
                        ));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let lifeStageSets = {};
                let lifeStageExcludeSend = {};
                let lifeStageExcludeReceive = {};

                for (let grid_token of neighbor_grid_tokens) {
                    for (let option of lifeStageOptions) {
                        if (!lifeStageSets[option.token]) {
                            lifeStageSets[option.token] = {};
                        }

                        let members = results[idx++];
                        for (let member of members) {
                            lifeStageSets[option.token][member] = true;
                        }
                    }

                    for (let option of lifeStageOptions) {
                        if (!lifeStageExcludeSend[option.token]) {
                            lifeStageExcludeSend[option.token] = {};
                        }
                        if (!lifeStageExcludeReceive[option.token]) {
                            lifeStageExcludeReceive[option.token] = {};
                        }

                        let sendExclusions = results[idx++];
                        for (let token of sendExclusions) {
                            lifeStageExcludeSend[option.token][token] = true;
                        }

                        let receiveExclusions = results[idx++];
                        for (let token of receiveExclusions) {
                            lifeStageExcludeReceive[option.token][token] = true;
                        }
                    }
                }

                // If no life stages set for me, handle exclusions
                if (myLifeStageTokens.size === 0) {
                    for (let life_stage_token in lifeStageExcludeReceive) {
                        let tokens = lifeStageExcludeReceive[life_stage_token];
                        for (let token in tokens) {
                            exclude.send[token] = true;
                        }
                    }

                    for (let life_stage_token in lifeStageExcludeSend) {
                        let tokens = lifeStageExcludeSend[life_stage_token];
                        for (let token in tokens) {
                            exclude.receive[token] = true;
                        }
                    }
                } else {
                    // Process each person token
                    for (let token in person_tokens) {
                        let personLifeStageTokens = new Set();

                        // Find all life stages for this person
                        for (let lifeStageToken in lifeStageSets) {
                            if (lifeStageSets[lifeStageToken][token]) {
                                personLifeStageTokens.add(lifeStageToken);
                            }
                        }

                        if (personLifeStageTokens.size === 0) {
                            // Exclude sending/receiving if filter specified with importance
                            for (let k in lifeStageExcludeSend) {
                                if (my_token in lifeStageExcludeSend[k]) {
                                    exclude.send[token] = true;
                                    break;
                                }
                            }

                            for (let k in lifeStageExcludeReceive) {
                                if (my_token in lifeStageExcludeReceive[k]) {
                                    exclude.receive[token] = true;
                                    break;
                                }
                            }
                        } else {
                            // Check bi-directional exclusions for each life stage combination
                            let shouldExcludeSend = true;
                            let shouldExcludeReceive = true;

                            // For each of my life stages
                            for (let myLifeStage of myLifeStageTokens) {
                                // For each of their life stages
                                for (let theirLifeStage of personLifeStageTokens) {
                                    // Check if they accept my life stage and I accept their life stage
                                    if (!(token in lifeStageExcludeReceive[myLifeStage]) &&
                                        !(my_token in lifeStageExcludeSend[theirLifeStage])) {
                                        shouldExcludeSend = false;
                                    }

                                    if (!(token in lifeStageExcludeSend[myLifeStage]) &&
                                        !(my_token in lifeStageExcludeReceive[theirLifeStage])) {
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
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterLifeStages:', e);
                reject(e);
            }
        });
    }

    function filterDrinking() {
        return new Promise(async (resolve, reject) => {
            try {
                let drinkingOptions = await getDrinking();
                let section_key = cacheService.keys.persons_section_data(my_token, 'drinking');
                let section_data = (await cacheService.getObj(section_key)) || {};

                let pipeline = cacheService.startPipeline();

                let myDrinkingToken = null;
                if (Object.keys(section_data).length) {
                    let item = Object.values(section_data)[0];
                    myDrinkingToken = item.token;
                }

                for (let grid_token of neighbor_grid_tokens) {
                    for (let option of drinkingOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_set(
                            grid_token,
                            `drinking:${option.token}`
                        ));
                    }

                    // Get excluded drinking send/receive
                    for (let option of drinkingOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `drinkings:${option.token}`,
                            'send'
                        ));
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `drinkings:${option.token}`,
                            'receive'
                        ));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let drinkingSets = {};
                let drinkingExcludeSend = {};
                let drinkingExcludeReceive = {};

                // Process pipeline results
                for (let grid_token of neighbor_grid_tokens) {
                    // Process drinking set memberships
                    for (let option of drinkingOptions) {
                        if (!drinkingSets[option.token]) {
                            drinkingSets[option.token] = {};
                        }

                        let members = results[idx++];
                        for (let member of members) {
                            drinkingSets[option.token][member] = true;
                        }
                    }

                    // Process drinking exclusions
                    for (let option of drinkingOptions) {
                        if (!drinkingExcludeSend[option.token]) {
                            drinkingExcludeSend[option.token] = {};
                        }
                        if (!drinkingExcludeReceive[option.token]) {
                            drinkingExcludeReceive[option.token] = {};
                        }

                        // Send exclusions
                        let sendExclusions = results[idx++];
                        for (let token of sendExclusions) {
                            drinkingExcludeSend[option.token][token] = true;
                        }

                        // Receive exclusions
                        let receiveExclusions = results[idx++];
                        for (let token of receiveExclusions) {
                            drinkingExcludeReceive[option.token][token] = true;
                        }
                    }
                }

                // If drinking not set, exclude for all excluded
                if (!myDrinkingToken) {
                    for (let drinking_token in drinkingExcludeReceive) {
                        let tokens = drinkingExcludeReceive[drinking_token];
                        for (let token in tokens) {
                            exclude.send[token] = true;
                        }
                    }

                    for (let drinking_token in drinkingExcludeSend) {
                        let tokens = drinkingExcludeSend[drinking_token];
                        for (let token in tokens) {
                            exclude.receive[token] = true;
                        }
                    }
                } else {
                    // Process each person token
                    for (let token in person_tokens) {
                        let personDrinkingToken = null;

                        for (let drinkingToken in drinkingSets) {
                            if (drinkingSets[drinkingToken][token]) {
                                personDrinkingToken = drinkingToken;
                                break;
                            }
                        }

                        if(!personDrinkingToken) {
                            //exclude sending/receiving if filter specified with importance
                            for(let k in drinkingExcludeSend) {
                                if(my_token in drinkingExcludeSend[k]) {
                                    exclude.send[token] = true;
                                    break;
                                }
                            }

                            for(let k in drinkingExcludeReceive) {
                                if(my_token in drinkingExcludeReceive[k]) {
                                    exclude.receive[token] = true;
                                    break;
                                }
                            }
                        } else {
                            // Exclude send if person has excluded my preference or I have excluded their preference
                            if (token in drinkingExcludeReceive[myDrinkingToken] ||
                                my_token in drinkingExcludeSend[personDrinkingToken]) {
                                exclude.send[token] = true;
                            }

                            // Exclude receive if person has excluded my preference or I have excluded their preference
                            if (token in drinkingExcludeSend[myDrinkingToken] ||
                                my_token in drinkingExcludeReceive[personDrinkingToken]) {
                                exclude.receive[token] = true;
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterDrinking:', e);
                reject(e);
            }
        });
    }

    function filterSmoking() {
        return new Promise(async (resolve, reject) => {
            try {
                let smokingOptions = await getSmoking();
                let section_key = cacheService.keys.persons_section_data(my_token, 'smoking');
                let section_data = (await cacheService.getObj(section_key)) || {};

                let pipeline = cacheService.startPipeline();

                let mySmokingToken = null;

                if (Object.keys(section_data).length) {
                    let item = Object.values(section_data)[0];
                    mySmokingToken = item.token;
                }

                for (let grid_token of neighbor_grid_tokens) {
                    for (let option of smokingOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_set(
                            grid_token,
                            `smoking:${option.token}`
                        ));
                    }

                    // Get excluded smoking send/receive
                    for (let option of smokingOptions) {
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `smokings:${option.token}`,
                            'send'
                        ));
                        pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `smokings:${option.token}`,
                            'receive'
                        ));
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                let smokingSets = {};
                let smokingExcludeSend = {};
                let smokingExcludeReceive = {};

                // Process pipeline results
                for (let grid_token of neighbor_grid_tokens) {
                    // Process smoking set memberships
                    for (let option of smokingOptions) {
                        if (!smokingSets[option.token]) {
                            smokingSets[option.token] = {};
                        }

                        let members = results[idx++];
                        for (let member of members) {
                            smokingSets[option.token][member] = true;
                        }
                    }

                    // Process smoking exclusions
                    for (let option of smokingOptions) {
                        if (!smokingExcludeSend[option.token]) {
                            smokingExcludeSend[option.token] = {};
                        }
                        if (!smokingExcludeReceive[option.token]) {
                            smokingExcludeReceive[option.token] = {};
                        }

                        // Send exclusions
                        let sendExclusions = results[idx++];
                        for (let token of sendExclusions) {
                            smokingExcludeSend[option.token][token] = true;
                        }

                        // Receive exclusions
                        let receiveExclusions = results[idx++];
                        for (let token of receiveExclusions) {
                            smokingExcludeReceive[option.token][token] = true;
                        }
                    }
                }

                // If smoking not set, exclude for all excluded
                if (!mySmokingToken) {
                    for (let smoking_token in smokingExcludeReceive) {
                        let tokens = smokingExcludeReceive[smoking_token];
                        for (let token in tokens) {
                            exclude.send[token] = true;
                        }
                    }

                    for (let smoking_token in smokingExcludeSend) {
                        let tokens = smokingExcludeSend[smoking_token];
                        for (let token in tokens) {
                            exclude.receive[token] = true;
                        }
                    }
                } else {
                    // Process each person token
                    for (let token in person_tokens) {
                        let personSmokingToken = null;

                        for (let smokingToken in smokingSets) {
                            if (smokingSets[smokingToken][token]) {
                                personSmokingToken = smokingToken;
                                break;
                            }
                        }

                        if(!personSmokingToken) {
                            //exclude sending/receiving if filter specified with importance
                            for(let k in smokingExcludeSend) {
                                if(my_token in smokingExcludeSend[k]) {
                                    exclude.send[token] = true;
                                    break;
                                }
                            }

                            for(let k in smokingExcludeReceive) {
                                if(my_token in smokingExcludeReceive[k]) {
                                    exclude.receive[token] = true;
                                    break;
                                }
                            }
                        } else {
                            // Exclude send if person has excluded my preference or I have excluded their preference
                            if (token in smokingExcludeReceive[mySmokingToken] ||
                                my_token in smokingExcludeSend[personSmokingToken]) {
                                exclude.send[token] = true;
                            }

                            // Exclude receive if person has excluded my preference or I have excluded their preference
                            if (token in smokingExcludeSend[mySmokingToken] ||
                                my_token in smokingExcludeReceive[personSmokingToken]) {
                                exclude.receive[token] = true;
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterSmoking:', e);
                reject(e);
            }
        });
    }

    function setNotExcluded() {
        for(let person_token in person_tokens) {
            if(!(person_token in exclude.send) || !(person_token in exclude.receive)) {
                persons_not_excluded[person_token] = true;
            }
        }
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!me) {
                return reject("Person required");
            }
            
            my_token = me.person_token;

            let memory_start = process.memoryUsage().heapTotal / 1024 / 1024;

            let t1 = timeNow();
            my_filters = await getPersonFilters(me);

            console.log({
                my_filters: timeNow() - t1
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
                memory_start,
                memory_end
            });

            // let t4 = timeNow();
            await filterOnlineStatus();

            console.log({
                after_online_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                online: timeNow() - t4
            });

            let t5 = timeNow();
            await filterNetworks();

            console.log({
                after_networks_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                networks: timeNow() - t5
            });

            let t6 = timeNow();
            await filterModes();

            console.log({
                after_modes_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                modes: timeNow() - t6
            });

            let t7 = timeNow();

            await filterVerifications();

            console.log({
                after_verifications_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                verifications: timeNow() - t7
            });

            let t8 = timeNow();

            await filterAge();

            console.log({
                after_age_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                age: timeNow() - t8
            });

            let t9 = timeNow();

            await filterGenders();

            console.log({
                after_genders_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                genders: timeNow() - t9
            });

            let t = timeNow();
            await filterLifeStages();

            console.log({
                after_life_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                life: timeNow() - t
            });

            let t10 = timeNow();

            await filterDrinking();

            console.log({
                drinking: timeNow() - t10
            });

            console.log({
                after_drinking_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });
            
            let t11 = timeNow();
            
            await filterSmoking();

            console.log({
                smoking: timeNow() - t11
            });

            console.log({
                after_smoking_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            let t12 = timeNow();

            setNotExcluded();

            console.log({
                not_excluded: timeNow() - t12
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