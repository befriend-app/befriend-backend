const cacheService = require('./cache');
const dbService = require('./db');

const { getModes, getPersonExcludedModes } = require('./modes');
const { getNetworksForFilters } = require('./network');
const { getGendersLookup } = require('./genders');


const filterMappings = {
    availability: {
        token: 'availability',
        name: 'Availability',
        table: 'persons_availability',
        multi: true,
    },
    activity_types: {
        token: 'activity_types',
        name: 'Activity Types',
        table: 'activity_types',
        column: 'activity_type_id',
        multi: true,
    },
    modes: {
        token: 'modes',
        name: 'Modes',
        table: 'modes',
        column: 'mode_id',
        multi: true,
    },
    networks: {
        token: 'networks',
        name: 'Networks',
        table: 'networks',
        column: 'network_id',
        filters_table: 'persons_filters_networks',
        multi: true,
    },
    reviews: {
        token: 'reviews',
        name: 'Reviews',
        single: true,
    },
    reviews_new: {
        token: 'reviews_new',
        name: 'New',
        single: true,
    },
    reviews_safety: {
        token: 'reviews_safety',
        name: 'Safety',
        single: true,
    },
    reviews_trust: {
        token: 'reviews_trust',
        name: 'Trust',
        single: true,
    },
    reviews_timeliness: {
        token: 'reviews_timeliness',
        name: 'Timeliness',
        single: true,
    },
    reviews_friendliness: {
        token: 'reviews_friendliness',
        name: 'Friendliness',
        single: true,
    },
    reviews_fun: {
        token: 'reviews_fun',
        name: 'Fun',
        single: true,
    },
    verifications: {
        token: 'verifications',
        name: 'Verifications',
        single: true,
    },
    verification_in_person: {
        token: 'verification_in_person',
        name: 'In-Person',
        single: true,
    },
    verification_linkedin: {
        token: 'verification_linkedin',
        name: 'LinkedIn',
        single: true,
    },
    verification_dl: {
        token: 'verification_dl',
        name: "Driver's License",
        single: true,
    },
    verification_cc: {
        token: 'verification_cc',
        name: 'Credit Card',
        single: true,
    },
    verification_video: {
        token: 'verification_video',
        name: 'Video',
        single: true,
    },
    verification_mailer: {
        token: 'verification_mailer',
        name: 'Mail',
        single: true,
    },
    distance: {
        token: 'distance',
        name: 'Distance',
        single: true,
    },
    ages: {
        token: 'ages',
        name: 'Age',
        single: true,
    },
    genders: {
        token: 'genders',
        name: 'Gender',
        column: 'gender_id',
        table: 'genders',
        multi: true,
    },
    movies: {
        token: 'movies',
        name: 'Movies',
        table: 'movies',
        column: 'movie_id',
        multi: true,
        importance: true
    },
    movie_genres: {
        token: 'movie_genres',
        name: 'Movie Genres',
        table: 'movie_genres',
        column: 'movie_genre_id',
        multi: true,
        importance: true
    },
    tv_shows: {
        token: 'tv_shows',
        name: 'TV Shows',
        table: 'tv_shows',
        column: 'tv_show_id',
        multi: true,
        importance: true
    },
    tv_show_genres: {
        token: 'tv_show_genres',
        name: 'TV Show Genres',
        table: 'tv_genres',
        column: 'tv_show_genre_id',
        multi: true,
        importance: true
    },
    sports: {
        token: 'sports',
        name: 'Sports',
        multi: true,
        importance: true
    },
    sports_play: {
        token: 'sports_play',
        name: 'Play',
        table: 'sports',
        column: 'sport_play_id',
        multi: true,
        importance: true
    },
    sports_leagues: {
        token: 'sports_league',
        name: 'Leagues',
        table: 'sports_leagues',
        column: 'sport_league_id',
        multi: true,
        importance: true
    },
    sports_teams: {
        token: 'sport_team',
        name: 'Teams',
        table: 'sports_teams',
        column: 'sport_team_id',
        multi: true,
        importance: true
    },
    music: {
        token: 'music',
        name: 'Music',
        multi: true,
        importance: true
    },
    music_artists: {
        token: 'music_artists',
        name: 'Music Artists',
        table: 'music_artists',
        column: 'music_artist_id',
        multi: true,
        importance: true
    },
    music_genres: {
        token: 'music_genres',
        name: 'Music Genres',
        table: 'music_genres',
        column: 'music_genre_id',
        multi: true,
        importance: true
    },
    instruments: {
        token: 'instruments',
        name: 'Instruments',
        table: 'instruments',
        column: 'instrument_id',
        multi: true,
        importance: true
    },
    schools: {
        token: 'schools',
        name: 'Schools',
        table: 'schools',
        column: 'school_id',
        multi: true,
        importance: true
    },
    work: {
        token: 'work',
        name: 'Work',
        multi: true,
        importance: true
    },
    work_industries: {
        token: 'work_industries',
        name: 'Industry',
        table: 'work_industries',
        column: 'work_industry_id',
        multi: true,
        importance: true
    },
    work_roles: {
        token: 'work_roles',
        name: 'Role',
        table: 'work_roles',
        column: 'work_role_id',
        multi: true,
        importance: true
    },
    life_stages: {
        token: 'life_stages',
        name: 'Life Stage',
        table: 'life_stages',
        column: 'life_stage_id',
        multi: true,
        importance: true
    },
    relationship: {
        token: 'relationship',
        name: 'Relationship Status',
        table: 'relationship_status',
        column: 'relationship_status_id',
        multi: true,
        importance: true
    },
    languages: {
        token: 'languages',
        name: 'Languages',
        table: 'languages',
        column: 'language_id',
        multi: true,
        importance: true
    },
    politics: {
        token: 'politics',
        name: 'Politics',
        table: 'politics',
        column: 'politics_id',
        multi: true,
        importance: true
    },
    religion: {
        token: 'religion',
        name: 'Religion',
        table: 'religions',
        column: 'religion_id',
        multi: true,
        importance: true
    },
    drinking: {
        token: 'drinking',
        name: 'Drinking',
        table: 'drinking',
        column: 'drinking_id',
        multi: true,
        importance: true
    },
    smoking: {
        token: 'smoking',
        name: 'Smoking',
        table: 'smoking',
        column: 'smoking_id',
        multi: true,
        importance: true
    },
};

function getFilters() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.filters) {
            return resolve(module.exports.filters);
        }

        let cache_key = cacheService.keys.filters;

        try {
            let cache_data = await cacheService.getObj(cache_key);

            if (cache_data) {
                module.exports.filters = cache_data;
                return resolve(cache_data);
            }

            let conn = await dbService.conn();

            let filters = await conn('filters').whereNull('deleted');

            let filters_dict = filters.reduce(
                (acc, filter) => {
                    acc.byId[filter.id] = filter;
                    acc.byToken[filter.token] = filter;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            module.exports.filters = filters_dict;

            await cacheService.setCache(cache_key, filters_dict);

            resolve(filters_dict);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonFilters(person) {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.person_filters(person.person_token);

        try {
            let person_filters = await cacheService.getObj(cache_key);

            if (person_filters) {
                return resolve(person_filters);
            }

            let filters = await module.exports.getFilters();

            let conn = await dbService.conn();

            let qry = await conn('persons_filters').where('person_id', person.id);

            person_filters = {};

            let groupedRows = {};

            for (let row of qry) {
                let filter = filters.byId[row.filter_id];
                if (!filter) continue;

                if (!groupedRows[filter.token]) {
                    groupedRows[filter.token] = [];
                }
                groupedRows[filter.token].push(row);
            }

            for (let filter_token in groupedRows) {
                const rows = groupedRows[filter_token];
                const mapping = filterMappings[filter_token];
                if (!mapping) continue;

                // Get first row for base properties
                const baseRow = rows[0];

                // Create base filter entry
                let filterEntry = {
                    id: baseRow.id,
                    filter_id: baseRow.filter_id,
                    is_send: baseRow.is_send,
                    is_receive: baseRow.is_receive,
                    is_active: baseRow.is_active,
                    created: baseRow.created,
                    updated: baseRow.updated,
                };

                // Handle single vs multi filters differently
                if (mapping.multi) {
                    // Initialize multi filter with base properties and empty items
                    person_filters[filter_token] = {
                        ...filterEntry,
                        items: {},
                    };

                    // Process each row as an item
                    for (let row of rows) {
                        let itemEntry = {
                            id: row.id,
                            created: row.created,
                            updated: row.updated,
                        };

                        // Add column-specific values
                        if (mapping.column && row[mapping.column]) {
                            itemEntry[mapping.token] = row[mapping.column];
                        }

                        // Add any filter values
                        if (row.filter_value !== null) {
                            itemEntry.filter_value = row.filter_value;
                        }
                        if (row.filter_value_min !== null) {
                            itemEntry.filter_value_min = row.filter_value_min;
                        }
                        if (row.filter_value_max !== null) {
                            itemEntry.filter_value_max = row.filter_value_max;
                        }
                        if (row.secondary_level !== null) {
                            itemEntry.secondary_level = row.secondary_level;
                        }

                        person_filters[filter_token].items[row.id] = itemEntry;
                    }
                } else {
                    if (baseRow.filter_value !== null) {
                        filterEntry.filter_value = baseRow.filter_value;
                    }
                    if (baseRow.filter_value_min !== null) {
                        filterEntry.filter_value_min = baseRow.filter_value_min;
                    }
                    if (baseRow.filter_value_max !== null) {
                        filterEntry.filter_value_max = baseRow.filter_value_max;
                    }
                    if (baseRow.secondary_level !== null) {
                        filterEntry.secondary_level = baseRow.secondary_level;
                    }

                    person_filters[filter_token] = filterEntry;
                }
            }

            //set cache if missed above
            await cacheService.setCache(cache_key, person_filters);
            resolve(person_filters);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updateGridSets(person, person_filters = null, filter_token, prev_grid_token = null) {
    let allNetworks, network_token, grid_token, keys_sets_add,keys_sets_del,
        keys_sorted_del, keys_sorted_add, rem_pipeline, add_pipeline;

    function updateOnline() {
        if(prev_grid_token) {
            keys_sets_del.add(cacheService.keys.persons_grid_exclude(prev_grid_token, 'online'));
        }

        if(person.is_online) {
            keys_sets_del.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
        } else {
            keys_sets_add.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
        }
    }

    function updateNetworks() {
        return new Promise(async (resolve, reject) => {
            try {
                const networksFilter = person_filters.networks;

                if (!networksFilter) {
                    return resolve();
                }

                let include_networks = new Set();
                let exclude_networks = new Set();

                for(let item of Object.values(networksFilter.items || {})) {
                    //skip own network
                    if(item.network_token === network_token) {
                        continue;
                    }

                    if (item.is_active) {
                        include_networks.add(item.network_token);
                    } else {
                        exclude_networks.add(item.network_token);
                    }
                }

                if(networksFilter.is_all_verified) {
                    for(let network of allNetworks.networks) {
                        if(network.network_token === network_token) {
                            continue;
                        }

                        if (network.is_verified) {
                            if(exclude_networks.has(network.network_token)) {
                                exclude_networks.delete(network.network_token);
                            }
                        } else {
                            if(!include_networks.has(network.network_token)) {
                                exclude_networks.add(network.network_token);    
                            }
                        }
                    }
                }

                for(let network of allNetworks.networks) {
                    if(network.network_token === network_token) {
                        continue;
                    }

                    if(!networksFilter.is_active || networksFilter.is_any_network) {
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`, 'send'));
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`, 'receive'));
                    } else {
                        //send
                        if(!networksFilter.is_send) {
                            keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`, 'send'));
                        } else {
                            if(include_networks.has(network.network_token)) {
                                keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`, 'send'));
                            } else if(exclude_networks.has(network.network_token)) {
                                keys_sets_add.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`), 'send');
                            }
                        }
                        
                        //receive
                        if(!networksFilter.is_receive) {
                            keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`), 'receive');
                        } else {
                            if(include_networks.has(network.network_token)) {
                                keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`), 'receive');
                            } else if(exclude_networks.has(network.network_token)) {
                                keys_sets_add.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `networks:${network.network_token}`), 'receive');
                            }
                        }
                    }
                }

                if(prev_grid_token) {
                    for(let network of allNetworks.networks) {
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(prev_grid_token, `networks:${network.network_token}`, 'send'));
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(prev_grid_token, `networks:${network.network_token}`, 'receive'));
                    }
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    }

    function updateModes() {
        return new Promise(async (resolve, reject) => {
            try {
                let modes = await getModes();

                let excluded_modes = await getPersonExcludedModes(person, person_filters);

                for(let mode of Object.values(modes.byId) || {}) {
                   keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `modes:${mode.token}`, 'send'));
                   keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `modes:${mode.token}`, 'receive'));

                    if(prev_grid_token) {
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(prev_grid_token, `modes:${mode.token}`, 'send'));
                        keys_sets_del.add(cacheService.keys.persons_grid_exclude_send_receive(prev_grid_token, `modes:${mode.token}`, 'receive'));
                    }
                }

                for(let mode_token of excluded_modes.send) {
                    keys_sets_add.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `modes:${mode_token}`, 'send'));
                }

                for(let mode_token of excluded_modes.receive) {
                    keys_sets_add.add(cacheService.keys.persons_grid_exclude_send_receive(grid_token, `modes:${mode_token}`, 'receive'));
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    }

    function updateVerifications() {
        return new Promise(async (resolve, reject) => {
            try {
                const verificationTypes = [
                    'in_person',
                    'linkedin',
                ];

                if(person.is_verified_in_person) {
                    keys_sets_add.add(cacheService.keys.persons_grid_set(grid_token, `verified:in_person`));
                } else {
                   keys_sets_del.add(cacheService.keys.persons_grid_set(grid_token, `verified:in_person`));
                }

                if(person.is_verified_linkedin) {
                    keys_sets_add.add(cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`));
                } else {
                   keys_sets_del.add(cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`));
                }

                if(!person_filters.verifications?.is_active) {
                   keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'send'));
                   keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'receive'));
                   keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:linkedin', 'send'));
                   keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token,'verifications:linkedin', 'receive'));
                } else {
                    if(!person_filters.verification_in_person?.is_active) {
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive('verifications:in_person', 'send'));
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive('verifications:in_person', 'receive'));
                    } else {
                        if (person_filters.verification_in_person.is_send) {
                            keys_sets_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'send'));
                        } else {
                           keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'send'));
                        }

                        if (person_filters.verification_in_person.is_receive) {
                            keys_sets_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'receive'));
                        } else {
                           keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:in_person', 'receive'));
                        }
                    }

                    if(!person_filters.verification_linkedin?.is_active) {
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive('verifications:linkedin', 'send'));
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive('verifications:linkedin', 'receive'));
                    } else {
                        if (person_filters.verification_linkedin.is_send) {
                            keys_sets_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:linkedin', 'send'));
                        } else {
                           keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:linkedin', 'send'));
                        }

                        if (person_filters.verification_linkedin.is_receive) {
                            keys_sets_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:linkedin', 'receive'));
                        } else {
                           keys_sets_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'verifications:linkedin', 'receive'));
                        }
                    }
                }

                if (prev_grid_token) {
                    for (let type of verificationTypes) {
                       keys_sets_del.add(cacheService.keys.persons_grid_set(prev_grid_token, `verified:${type}`));
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, `verifications:${type}`, 'send'));
                       keys_sets_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, `verifications:${type}`, 'receive'));
                    }
                }
            } catch(e) {
                console.error('Error in updateVerifications:', e);
            }

            resolve();
        });
    }
    
    function updateAge() {
        return;
        let agesFilter = person_filters.ages;

        const sendKey = cacheService.keys.persons_grid_send_receive(grid_token, 'ages', 'send');
        const receiveKey = cacheService.keys.persons_grid_send_receive(grid_token, 'ages', 'receive');

        if(person.age) {
            add_pipeline.zAdd(cacheService.keys.persons_grid_set(grid_token, 'age'), {
                value: person.person_token,
                score: person.age
            });
        } else {
            keys_sorted_del.add(cacheService.keys.persons_grid_set(grid_token, 'age'), {})
        }

        if (prev_grid_token) {
           keys_sorted_del.add(cacheService.keys.persons_grid_set(prev_grid_token, 'age'));
            keys_sets_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, `ages`, 'send'));
           keys_sets_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, `ages`, 'receive'));

           //delete hash key
            rem_pipeline.hDel(cacheService.keys.persons_grid_hash(grid_token, 'age_prefs'), person.person_token);
        }

        if(agesFilter?.is_active) {
            if(agesFilter.is_send) {
                keys_sets_add.add(sendKey);
            } else {
                keys_sets_del.add(sendKey);
            }

            if(agesFilter.is_receive) {
                keys_sets_add.add(receiveKey);
            } else {
                keys_sets_del.add(receiveKey);
            }
        } else {
            keys_sets_del.add(sendKey);
            keys_sets_del.add(receiveKey);
        }
    }

    function updateGenders() {
        return new Promise(async (resolve, reject) => {
            try {
                let genderFilter = person_filters.genders;
                let genders = await getGendersLookup();

                let person_gender = genders.byId[person.gender_id];

                if(prev_grid_token) {
                    for(let gender_token in genders.byToken) {
                        if(gender_token !== 'any') {
                            keys_sets_del.add(cacheService.keys.persons_grid_set(prev_grid_token, `gender:${gender_token}`));
                            keys_sets_del.add(cacheService.keys.persons_grid_exclude(prev_grid_token, `genders:${gender_token}`, 'send'));
                            keys_sets_del.add(cacheService.keys.persons_grid_exclude(prev_grid_token, `genders:${gender_token}`, 'receive'));
                        }
                    }
                }

                for(let gender_token in genders.byToken) {
                    if(gender_token !== 'any') {
                        keys_sets_del.add(cacheService.keys.persons_grid_set(grid_token, `gender:${gender_token}`));
                    }
                }

                if(person_gender) {
                    keys_sets_add.add(cacheService.keys.persons_grid_set(grid_token, `gender:${person_gender.gender_token}`));
                }

                //filters
                if(!genderFilter) {
                    return resolve();
                }

                if(genderFilter.is_active) {
                    for(let gender_id in genders.byId) {
                        let gender = genders.byId[gender_id];

                        if(gender.gender_token === 'any') {
                            continue;
                        }

                        let genderItem = Object.values(genderFilter.items)
                            .find(item => item.gender_id === parseInt(gender_id));

                        if(genderFilter.is_send) {
                            if(!genderItem || !genderItem.is_active || genderItem.is_negative || genderItem.deleted) {
                                keys_sets_add.add(cacheService.keys.persons_grid_exclude(grid_token, `genders:${gender.gender_token}`, 'send'));
                            }
                        }

                        if(genderFilter.is_receive) {
                            if(!genderItem || !genderItem.is_active || genderItem.is_negative || genderItem.deleted) {
                                keys_sets_add.add(cacheService.keys.persons_grid_exclude(grid_token, `genders:${gender.gender_token}`, 'receive'));
                            }
                        }
                    }
                }


                resolve();
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        if(!person) {
            return reject();
        }

        if(!person.grid?.token) {
            console.error("Grid token required");
            return resolve();
        }

        grid_token = person.grid.token;

        try {
            if(!person_filters) {
                person_filters = await getPersonFilters(person);
            }

            allNetworks = await getNetworksForFilters();
            network_token = allNetworks.networks?.find(network=>network.id === person.network_id)?.network_token;

            if(!network_token) {
                console.error("Network token not found");

                return resolve();
            }
        } catch(e) {
            console.error(e);
            return reject();
        }

        keys_sets_add = new Set();
        keys_sets_del = new Set();

        keys_sorted_add = new Set();
        keys_sorted_del = new Set();

        rem_pipeline = cacheService.startPipeline();
        add_pipeline = cacheService.startPipeline();

        if(prev_grid_token) {
            await updateOnline();

            await updateNetworks();

            // location
            keys_sets_del.add(cacheService.keys.persons_grid_set(prev_grid_token, 'location'));
            keys_sets_add.add(cacheService.keys.persons_grid_set(grid_token, 'location'));

            await updateModes();

            await updateVerifications();
            
            await updateAge();

            await updateGenders();
        } else {
            if(filter_token === 'online') {
                await updateOnline();
            }

            if(filter_token === 'networks') {
                await updateNetworks();
            }

            if(filter_token === 'modes') {
                await updateModes();
            }

            if(filter_token === 'verifications') {
                await updateVerifications();
            }
            
            if(filter_token === 'ages') {
                await updateAge();
            }

            if(filter_token === 'genders') {
                await updateGenders();
            }
        }

        try {
            if(keys_sets_del.size) {
                for(let key of keys_sets_del) {
                    rem_pipeline.sRem(key, person.person_token);
                }

                await cacheService.execPipeline(rem_pipeline);
            }

            if(keys_sets_add.size) {
                for(let key of keys_sets_add) {
                    add_pipeline.sAdd(key, person.person_token);
                }

                await cacheService.execPipeline(add_pipeline);
            }

            if(keys_sorted_del.size) {
                for(let key of keys_sorted_del) {
                    rem_pipeline.zRem(key, person.person_token);
                }
            }
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    filters: null,
    filterMappings,
    getFilters,
    getPersonFilters,
    updateGridSets
};
