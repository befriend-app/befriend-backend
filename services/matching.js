const dayjs = require('dayjs');

let cacheService = require('../services/cache');
let dbService = require('../services/db');

let gridService = require('../services/grid');
let reviewService = require('../services/reviews');

const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow, shuffleFunc, isNumeric, calculateDistanceMeters } = require('./shared');
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
const { minAge, maxAge } = require('./persons');
const { token } = require('morgan');

const DEFAULT_DISTANCE_MILES = 20;
const MAX_PERSONS_PROCESS = 1000;

function getMatches(me, counts_only = false, future_location = null, activity = null) {
    let my_token, my_filters;
    let am_online = me?.is_online;
    let am_available = false;

    let neighbor_grid_tokens = [];

    let person_tokens = {};
    let selected_persons_data = {};

    let gridsLookup = {
        byId: {}
    };

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

    let interests_sections = ['movies', 'tv_shows', 'sports', 'music', 'instruments'];

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

                await filterDistance();

                console.log({
                    after_filter_distance_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    filter_distance: timeNow() - t
                });

                t = timeNow();

                await filterAges();

                console.log({
                    after_filter_ages_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                t = timeNow();

                await filterReviews();

                console.log({
                    after_filter_reviews_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    filter_reviews: timeNow() - t
                });

                t = timeNow();

                await filterPersonsAvailability();

                console.log({
                    after_filter_availability_excluded: {
                        send: Object.keys(exclude.send).length,
                        receive: Object.keys(exclude.receive).length,
                    }
                });

                console.log({
                    filter_availability: timeNow() - t
                });

                t = timeNow();
            } catch(e) {
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

        const baseScores = {
            biDirectionalBoth: 10,   // Priority 1
            biDirectionalFilter: 8,  // Priority 2
            biDirectionalItem: 7,    // Priority 3
            myFilterTheirItem: 6,    // Priority 4
            theirFilterMyItem: 5     // Priority 5
        };

        let myInterests = {
            filters: {},
            sections: {}
        };

        let personsInterests = {};

        function calculateInterestMatches(otherPersonInterests) {
            function setMatchData(section, item_token, category, match_type, table_key = null, name, favorite_position, secondary, importance, totals) {
                otherPersonInterests.matches.items[item_token] = {
                    section: section,
                    token: item_token,
                    table_key: table_key,
                    name: name,
                    totals: totals,
                    match: {
                        category: category,
                        [match_type]: true,
                        mine: {
                            favorite: {
                                position: favorite_position?.mine || null
                            },
                            secondary: secondary?.mine || null,
                            importance: importance?.mine || null,
                        },
                        theirs: {
                            favorite: {
                                position: favorite_position?.theirs || null
                            },
                            secondary: secondary?.theirs || null,
                            importance: importance?.theirs || null,
                        }
                    }
                };
            }

            let totalScore = 0;
            let matchCount = 0;

            let myMergedItems = {};
            let theirMergedItems = {};

            for (let section of interests_sections) {
                function calcPersonalTotals(myItem, theirItem) {
                    //calc total number of items/favorited
                    if(myItem && !myItem.deleted) {
                        totals.mine.all++;

                        if(myItem.is_favorite) {
                            totals.mine.favorite++;
                        }
                    }

                    if(theirItem && !theirItem.deleted) {
                        totals.theirs.all++;

                        if(theirItem.is_favorite) {
                            totals.theirs.favorite++;
                        }
                    }
                }

                myMergedItems[section] = {};
                theirMergedItems[section] = {};

                let myItems = myInterests.sections[section] || {};
                let myFilter = myInterests.filters[section] || {}
                let theirItems = otherPersonInterests.sections[section] || {};
                let theirFilter = otherPersonInterests.filters[section] || {};

                //see if both our filters are enabled
                let myFilterEnabled = myFilter?.is_active && myFilter.is_send;
                let theirFilterEnabled = theirFilter?.is_active && theirFilter.is_receive;

                let totals = {
                    mine: {
                        all: 0,
                        favorite: 0
                    },
                    theirs: {
                        all: 0,
                        favorite: 0
                    }
                };

                //merge my personal/filter items
                for(let token in myItems) {
                    if(!(token in myMergedItems[section])) {
                        myMergedItems[section][token] = {
                            personal: null,
                            filter: null
                        }
                    }

                    myMergedItems[section][token].personal = myItems[token];
                }

                if(myFilter.items) {
                    for(let k in myFilter.items) {
                        let item = myFilter.items[k];

                        if(!(item.token in myMergedItems[section])) {
                            myMergedItems[section][item.token] = {
                                personal: null,
                                filter: null
                            }
                        }

                        myMergedItems[section][item.token].filter = item;
                    }
                }

                //merge their personal/filter items
                for(let token in theirItems) {
                    if(!(token in theirMergedItems[section])) {
                        theirMergedItems[section][token] = {
                            personal: null,
                            filter: null
                        }
                    }

                    theirMergedItems[section][token].personal = theirItems[token];
                }

                if(theirFilter.items) {
                    for(let k in theirFilter.items) {
                        let item = theirFilter.items[k];

                        if(!(item.token in theirMergedItems[section])) {
                            theirMergedItems[section][item.token] = {
                                personal: null,
                                filter: null
                            }
                        }

                        theirMergedItems[section][item.token].filter = item;
                    }
                }

                for(let item_token in myMergedItems[section]) {
                    let myItem = myMergedItems[section][item_token];
                    calcPersonalTotals(myItem?.personal);
                }

                for(let item_token in theirMergedItems[section]) {
                    let theirItem = theirMergedItems[section][item_token];
                    calcPersonalTotals(null, theirItem?.personal);
                }

                for(let item_token in myMergedItems[section]) {
                    let myItem = myMergedItems[section][item_token];
                    let theirItem = theirMergedItems[section][item_token];

                    let is_bi_both = false;

                    if(myItem?.personal && theirItem?.personal && myItem?.filter && theirItem?.filter) {
                        if(myFilterEnabled && theirFilterEnabled) {
                            if(
                                !myItem.personal.deleted && !theirItem.personal.deleted
                                && myItem.filter.is_active && !myItem.filter.is_negative && !myItem.filter.deleted
                                && theirItem.filter.is_active && !theirItem.filter.is_negative && !theirItem.filter.deleted
                            ) {
                               is_bi_both = true;

                                setMatchData(
                                    section,
                                    item_token,
                                    'ultra',
                                    'is_bi_both',
                                    myItem.personal.table_key,
                                    myItem.personal.name,
                                    {
                                        mine: myItem.personal.favorite_position,
                                        theirs: theirItem.personal.favorite_position
                                    },
                                    {
                                        mine: {
                                            item: myItem.personal.secondary || null,
                                            filter: myItem.filter.secondary || null
                                        },
                                        theirs: {
                                            item: theirItem.personal.secondary || null,
                                            filter: theirItem.filter.secondary || null
                                        }
                                    },
                                    {
                                        mine: myItem.filter.importance,
                                        theirs: theirItem.filter.importance
                                    },
                                    totals
                                );
                            }
                        }
                    }

                    if(is_bi_both) {
                        continue;
                    }

                    let is_bi_filter = false;

                    if(myItem?.filter && theirItem?.filter) {
                        if(myFilterEnabled && theirFilterEnabled) {
                            if(myItem.filter.is_active && !myItem.filter.is_negative && !myItem.filter.deleted
                                && theirItem.filter.is_active && !theirItem.filter.is_negative && !theirItem.filter.deleted
                            ) {
                                is_bi_filter = true;

                                setMatchData(
                                    section,
                                    item_token,
                                    'super',
                                    'is_bi_filter',
                                    myItem.filter.table_key,
                                    myItem.filter.name,
                                    null,
                                    {
                                        mine: {
                                            filter: myItem.filter.secondary || null,
                                        },
                                        theirs: {
                                            filter: theirItem.filter.secondary || null,
                                        }
                                    },
                                    {
                                        mine: myItem.filter.importance,
                                        theirs: theirItem.filter.importance
                                    },
                                    totals
                                );
                            }
                        }
                    }

                    if(is_bi_filter) {
                        continue;
                    }

                    let is_bi_item = false;

                    if(myItem?.personal && theirItem?.personal) {
                        if(!myItem.personal.deleted && !theirItem.personal.deleted) {
                            is_bi_item = true;

                            setMatchData(
                                section,
                                item_token,
                                'super',
                                'is_bi_item',
                                myItem.personal.table_key,
                                myItem.personal.name,
                                {
                                    mine: myItem.personal.favorite_position,
                                    theirs: theirItem.personal.favorite_position
                                },
                                {
                                    mine: {
                                        item: myItem.personal.secondary || null,
                                    },
                                    theirs: {
                                        item: theirItem.personal.secondary || null,
                                    }
                                },
                                null,
                                totals
                            );
                        }
                    }

                    if(is_bi_item) {
                        continue;
                    }

                    let is_my_filter = false;

                    if(myItem?.filter && theirItem?.personal) {
                        if(myFilterEnabled) {
                            if(
                                myItem.filter.is_active && !myItem.filter.is_negative && !myItem.filter.deleted
                                && !theirItem.personal.deleted
                            ) {
                                is_my_filter = true;

                                setMatchData(
                                    section,
                                    item_token,
                                    'regular',
                                    'is_my_filter',
                                    myItem.filter.table_key || theirItem.personal.table_key,
                                    myItem.filter.name || theirItem.personal.name,
                                    {
                                        theirs: theirItem.personal.favorite_position
                                    },
                                    {
                                        mine: {
                                            filter: myItem.filter.secondary || null,
                                        },
                                        theirs: {
                                            item: theirItem.personal.secondary || null,
                                        }
                                    },
                                    {
                                        mine: myItem.filter.importance
                                    },
                                    totals
                                );
                            }
                        }
                    }

                    if(is_my_filter) {
                        continue;
                    }

                    let is_their_filter = false;

                    if(myItem?.personal && theirItem?.filter) {
                        if(theirFilterEnabled) {
                            if(
                                !myItem.personal.deleted
                                && theirItem.filter.is_active && !theirItem.filter.is_negative && !theirItem.filter.deleted
                            ) {
                                is_their_filter = true;

                                setMatchData(
                                    section,
                                    item_token,
                                    'regular',
                                    'is_their_filter',
                                    myItem.personal.table_key || theirItem.filter.table_key,
                                    myItem.personal.name || theirItem.filter.name,
                                    {
                                        mine: myItem.personal.favorite_position
                                    },
                                    {
                                        mine: {
                                            item: myItem.personal.secondary || null,
                                        },
                                        theirs: {
                                            filter: theirItem.filter.secondary || null,
                                        }
                                    },
                                    {
                                        theirs: theirItem.filter.importance
                                    },
                                    totals
                                );
                            }
                        }
                    }
                }
            }

            return {
                score: totalScore,
                matches: matchCount
            };
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Build my interests object
                let my_pipeline = cacheService.startPipeline();
                
                for (let section of interests_sections) {
                    myInterests.filters[section] = my_filters[section] || {};
                    
                    my_pipeline.hGet(cacheService.keys.person_sections(my_token), section);
                }
                
                let my_results = await cacheService.execMulti(my_pipeline);
                
                let my_idx = 0;
                
                for(let section of interests_sections) {
                    myInterests.sections[section] = JSON.parse(my_results[my_idx++]);
                }

                //filter remaining person tokens for retrieval of person/filter data
                for(let person_token in persons_not_excluded_after_stage_1) {
                    if(person_token in exclude.send && person_token in exclude.receive) {
                        continue;
                    }

                    personsInterests[person_token] = {
                        sections: {},
                        filters: {},
                        matches: {
                            items: {},
                            count: 0,
                            score: 0
                        }
                    };
                }

                let pipeline = cacheService.startPipeline();

                for(let person_token in personsInterests) {
                    let person_section_key = cacheService.keys.person_sections(person_token);
                    let person_filters_key = cacheService.keys.person_filters(person_token);

                    for(let section of interests_sections) {
                        pipeline.hGet(person_section_key, section);
                        pipeline.hGet(person_filters_key, section);
                    }
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                let t = timeNow();

                for(let person_token in personsInterests) {
                    for(let section of interests_sections) {
                        try {
                            personsInterests[person_token].sections[section] = JSON.parse(results[idx++]);
                            personsInterests[person_token].filters[section] = JSON.parse(results[idx++]);
                        } catch(e) {
                            console.error(e);
                        }
                    }

                    calculateInterestMatches(personsInterests[person_token]);
                }

                console.log({
                    filter: timeNow() - t,
                });

                resolve();
            } catch(e) {
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
                    gridsLookup.byId[grid.id] = grid;

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
                        } else { //if I am not verified
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

    function filterDistance() {
        return new Promise(async (resolve, reject) => {
            try {
                let my_location = me.location;
                let my_grid = me.grid;
                let filter = my_filters.distance;

                let me_exclude_send = filter?.is_active && filter?.is_send;
                let me_exclude_receive = filter?.is_active && filter?.is_receive;
                let my_max_distance = filter?.filter_value || DEFAULT_DISTANCE_MILES;

                let pipeline = cacheService.startPipeline();

                for(let person_token in persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'location');
                    pipeline.hGet(person_key, 'grid');
                    pipeline.hGet(filter_key, 'distance');
                }

                let results = await cacheService.execPipeline(pipeline);
                let idx = 0;

                for(let person_token in persons_not_excluded_after_stage_1) {
                    let their_location = results[idx++];
                    let their_grid = results[idx++];
                    let their_distance_filter = results[idx++];

                    try {
                        if(their_location) {
                            their_location = JSON.parse(their_location);
                        }

                        if(their_grid) {
                            their_grid = JSON.parse(their_grid);
                        }

                        if(their_distance_filter) {
                            their_distance_filter = JSON.parse(their_distance_filter);
                        }
                    } catch(e) {
                        console.error('Error parsing results:', e);
                    }

                    let should_exclude_send = false;
                    let should_exclude_receive = false;

                    // Calculate distance between persons
                    let distance_km = null;

                    if(my_location && their_location) {
                        // Calculate using lat/lon
                        distance_km = calculateDistanceMeters(
                            {
                                lat: my_location.lat,
                                lon: my_location.lon,
                            }, {
                                lat: their_location.lat,
                                lon: their_location.lon
                            },
                            true
                        );
                    } else if(my_grid && their_grid) {
                        //we'll later call the host network to help us filter distance without revealing actual location
                        if(my_grid.id === their_grid.id) {
                            distance_km = 0;
                        } else {
                            // Use grid center points
                            try {
                                distance_km = calculateDistanceMeters(
                                    {
                                        lat: gridsLookup.byId[my_grid.id].center_lat,
                                        lon: gridsLookup.byId[my_grid.id].center_lon,
                                    }, {
                                        lat: gridsLookup.byId[their_grid.id].center_lat,
                                        lon: gridsLookup.byId[their_grid.id].center_lon
                                    },
                                    true
                                );

                                //do a rough estimate of distance between two different grids
                                distance_km = distance_km / 3;
                            } catch(e) {
                                console.error(e);
                            }
                        }
                    }

                    let compare_distance = distance_km * kms_per_mile;

                    if(distance_km === null) {
                        exclude.send[person_token] = true;
                        exclude.receive[person_token] = true;
                        continue;
                    }

                    // Check if I should exclude sending/receiving to/from them
                    if(me_exclude_send && compare_distance > my_max_distance) {
                        should_exclude_send = true;
                    }

                    if(me_exclude_receive && compare_distance > my_max_distance) {
                        should_exclude_receive = true;
                    }

                    // Check their distance preferences
                    if(their_distance_filter?.is_active) {
                        let their_max_distance = their_distance_filter.filter_value || DEFAULT_DISTANCE_MILES;

                        if(their_distance_filter.is_send && compare_distance > their_max_distance) {
                            should_exclude_receive = true;
                        }

                        if(their_distance_filter.is_receive && compare_distance > their_max_distance) {
                            should_exclude_send = true;
                        }
                    }

                    if(should_exclude_send) {
                        exclude.send[person_token] = true;
                    }

                    if(should_exclude_receive) {
                        exclude.receive[person_token] = true;
                    }
                }

                resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function filterAges() {
        return new Promise(async (resolve, reject) => {
            try {
                let my_age_filter = my_filters.ages;

                let pipeline = cacheService.startPipeline();

                for (let person_token in persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'age');
                    pipeline.hGet(filter_key, 'ages');
                }

                let results = await cacheService.execPipeline(pipeline);
                let idx = 0;

                for (let person_token in persons_not_excluded_after_stage_1) {
                    let their_age = results[idx++];
                    let their_age_filter = results[idx++];

                    try {
                        if (their_age_filter) {
                            their_age_filter = JSON.parse(their_age_filter);
                        }

                        if (their_age) {
                            their_age = parseInt(their_age);
                        }
                    } catch (e) {
                        console.error('Error parsing age results:', e);
                        continue;
                    }

                    let should_exclude_send = false;
                    let should_exclude_receive = false;

                    // Check my age preferences
                    if (my_age_filter?.is_active) {
                        let my_min_age = parseInt(my_age_filter.filter_value_min) || minAge;
                        let my_max_age = parseInt(my_age_filter.filter_value_max) || maxAge;

                        if (their_age < my_min_age || their_age > my_max_age) {
                            if(my_age_filter.is_send) {
                                should_exclude_send = true;
                            }

                            if(my_age_filter.is_receive) {
                                should_exclude_receive = true;
                            }
                        }
                    }

                    // Check their age preferences
                    if (their_age_filter?.is_active) {
                        let their_min_age = parseInt(their_age_filter.filter_value_min) || minAge;
                        let their_max_age = parseInt(their_age_filter.filter_value_max) || maxAge;

                        if(me.age < their_min_age || me.age > their_max_age) {
                            if(their_age_filter.is_receive) {
                                should_exclude_send = true;
                            }

                            if(their_age_filter.is_send) {
                                should_exclude_receive = true;
                            }
                        }
                    }

                    if (should_exclude_send) {
                        exclude.send[person_token] = true;
                    }

                    if (should_exclude_receive) {
                        exclude.receive[person_token] = true;
                    }
                }

                resolve();
            } catch (e) {
                console.error('Error in filterAges:', e);
                return reject(e);
            }
        });
    }

    function filterReviews() {
        return new Promise(async (resolve, reject) => {
            try {
                let myReviewsFilter = my_filters.reviews;
                let myNewReviewsFilter = my_filters.reviews_new;

                let me_exclude_send_new = myReviewsFilter.is_active && !myNewReviewsFilter.is_active && myNewReviewsFilter.is_send;
                let me_exclude_receive_new = myReviewsFilter.is_active && !myNewReviewsFilter.is_active && myNewReviewsFilter.is_receive;

                let myExclusions = {
                    send: {},
                    receive: {}
                };

                const reviewTypes = ['safety', 'trust', 'timeliness', 'friendliness', 'fun'];

                for(let type of reviewTypes) {
                    let filter = my_filters[`reviews_${type}`];

                    if(myReviewsFilter.is_active && filter.is_active) {
                        //use custom filter value or default
                        let value = filter.filter_value || reviewService.filters.default;

                        if(filter.is_send) {
                            myExclusions.send[type] = value;
                        }

                        if(filter.is_receive) {
                            myExclusions.receive[type] = value;
                        }
                    }
                }

                let new_persons_tokens = {};
                let persons_ratings = {};

                let exclude_match_new = {
                    send: {},
                    receive: {}
                }
                
                let exclude_settings = {
                    send: {},
                    receive: {}
                };

                // Get new members data
                let pipeline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline.sMembers(cacheService.keys.persons_grid_set(grid_token, 'is_new_person'));
                }

                let results = await cacheService.execPipeline(pipeline);
                
                for (let grid of results) {
                    for (let person_token of grid) {
                        new_persons_tokens[person_token] = true;
                    }
                }

                // Reviews ratings and filter settings
                pipeline = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    // Persons who excluded match with new
                    pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(grid_token, 'reviews:match_new', 'send'));
                    pipeline.sMembers(cacheService.keys.persons_grid_exclude_send_receive(grid_token, 'reviews:match_new', 'receive'));

                    for (let type of reviewTypes) {
                        // Ratings for each person
                        pipeline.zRangeWithScores(cacheService.keys.persons_grid_sorted(grid_token, `reviews:${type}`), 0, -1);

                        // Exclude filter settings for each person
                        pipeline.zRangeWithScores(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `reviews:${type}`, 'send'), 0, -1);
                        pipeline.zRangeWithScores(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `reviews:${type}`, 'receive'), 0, -1);
                    }
                }

                results = await cacheService.execPipeline(pipeline);

                let idx = 0;
                
                // Process match new preferences
                for (let grid_token of neighbor_grid_tokens) {
                    let exclude_send_new = results[idx++];
                    let exclude_receive_new = results[idx++];

                    for (let token of exclude_send_new) {
                        exclude_match_new.send[token] = true;
                    }

                    for (let token of exclude_receive_new) {
                        exclude_match_new.receive[token] = true;
                    }

                    // Process ratings for each review type
                    for (let type of reviewTypes) {
                        // Get person ratings
                        let ratings = results[idx++];
                        
                        for (let person of ratings) {
                            let person_token = person.value;
                            
                            if (!persons_ratings[person_token]) {
                                persons_ratings[person_token] = {};
                            }
                            persons_ratings[person_token][type] = person.score;
                        }

                        // Get send settings
                        let exclude_send = results[idx++];
                        
                        for (let person of exclude_send) {
                            let person_token = person.value;
                            
                            if (!exclude_settings.send[person_token]) {
                                exclude_settings.send[person_token] = {};
                            }

                            exclude_settings.send[person_token][type] = person.score;
                        }

                        // Get receive settings
                        let exclude_receive = results[idx++];

                        for (let person of exclude_receive) {
                            let person_token = person.value;

                            if (!exclude_settings.receive[person_token]) {
                                exclude_settings.receive[person_token] = {};
                            }

                            exclude_settings.receive[person_token][type] = person.score;
                        }
                    }
                }

                // Apply review filters
                for (let token in persons_not_excluded_after_stage_1) {
                    let auto_include = {
                        send: false,
                        receive: false
                    }

                    // Handle new member matching
                    if (new_persons_tokens[token]) {
                        if(me.is_new) {
                            if(!me_exclude_send_new && !(token in exclude_match_new.receive)) {
                                auto_include.send = true;
                            }

                            if(!me_exclude_receive_new && !(token in exclude_match_new.send)) {
                                auto_include.receive = true;
                            }
                        } else {
                            if(!(me_exclude_send_new)) {
                                auto_include.send = true;
                            }

                            if(!(me_exclude_receive_new)) {
                                auto_include.receive = true;
                            }
                        }
                    }

                    // Check review settings
                    let exclude_send = false;
                    let exclude_receive = false;

                    let myRatings = me.reviews;
                    let personRatings = persons_ratings[token];

                    // Bi-directional send/receive filter settings
                    if(!auto_include.send) {
                        for (let type of reviewTypes) {
                            let my_threshold = myExclusions.send[type];
                            let their_threshold = exclude_settings.receive[token]?.[type];

                            if(!my_threshold && !their_threshold) {
                                continue;
                            }

                            if ((my_threshold && !isNumeric(personRatings[type])) || (my_threshold && personRatings[type] < my_threshold)) {
                                exclude_send = true;
                                break;
                            }

                            if((their_threshold && !isNumeric(myRatings[type]) )|| (their_threshold && myRatings[type] < their_threshold)) {
                                if(me.is_new && !(token in exclude_match_new.receive)) {
                                    continue;
                                }

                                exclude_send = true;
                                break;
                            }
                        }
                    }

                    if(!auto_include.receive) {
                        for (let type of reviewTypes) {
                            let my_threshold = myExclusions.receive[type];
                            let their_threshold = exclude_settings.send[token]?.[type];

                            if(!my_threshold && !their_threshold) {
                                continue;
                            }

                            if ((my_threshold && !isNumeric(personRatings[type])) || (my_threshold && personRatings[type] < my_threshold)) {
                                exclude_receive = true;
                                break;
                            }

                            if((their_threshold && !isNumeric(myRatings[type]) )|| (their_threshold && myRatings[type] < their_threshold)) {
                                if(me.is_new && !(token in exclude_match_new.send)) {
                                    continue;
                                }

                                exclude_receive = true;
                                break;
                            }
                        }
                    }

                    if (exclude_send) {
                        exclude.send[token] = true;
                    }

                    if (exclude_receive) {
                        exclude.receive[token] = true;
                    }
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
            try {
                let pipeline = cacheService.startPipeline();

                for (let person_token in persons_not_excluded_after_stage_1) {
                    let person_key = cacheService.keys.person(person_token);
                    let filter_key = cacheService.keys.person_filters(person_token);

                    pipeline.hGet(person_key, 'timezone');
                    pipeline.hGet(filter_key, 'availability');
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                for (let person_token in persons_not_excluded_after_stage_1) {
                    let timezone = results[idx++];
                    let availability = results[idx++];

                    try {
                         availability = JSON.parse(availability);
                    } catch(e) {
                        console.error(e);
                        continue;
                    }

                    let is_available = isPersonAvailable({
                        timezone
                    }, availability);

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

    function filterSection(sectionKey, getOptions, isMultiSelect) {
        return new Promise(async (resolve, reject) => {
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

    function organizeFinal() {
        let not_excluded = {
            send: {},
            receive: {}
        }

        for(let person_token in persons_not_excluded_after_stage_1) {
            let included = false;

            if(!(person_token in exclude.send)) {
                not_excluded.send[person_token] = true;
                organized.counts.send++;
                included = true;
            }

            //if my online status is set to offline, exclude receiving from all
            if(!me.is_online) {
                exclude.receive[person_token] = true;
            } else {
                //allow receiving notifications if not excluded
                if(!(person_token in exclude.receive)) {
                    not_excluded.receive[person_token] = true;
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

            am_available = isPersonAvailable(me, my_filters.availability);

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
                persons_after_stage_1: Object.keys(persons_not_excluded_after_stage_1).length
            });

            console.log({
                after_filter_stage_1_excluded: {
                    send: Object.keys(exclude.send).length,
                    receive: Object.keys(exclude.receive).length,
                }
            });

            console.log({
                filter_persons: timeNow() - t
            });

            t = timeNow();

            await processStage2();

            console.log({
                stage_2: timeNow() - t
            });

            t = timeNow();

            await matchInterests();

            console.log({
                filter_interests: timeNow() - t
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