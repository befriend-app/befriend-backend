const cacheService = require('./cache');
const dbService = require('./db');
const { getModes } = require('./modes');
const { getNetworksForFilters } = require('./network');

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
    let allNetworks, network_token, grid_token, cache_keys_add, cache_keys_del, rem_pipeline, add_pipeline;

    function updateNetworks() {
        return new Promise(async (resolve, reject) => {
            try {
                const networksFilter = person_filters.networks;

                if (!networksFilter) {
                    return resolve();
                }

                //add to own network
                cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, `networks:${network_token}`));

                for(let item of Object.values(networksFilter.items || {})) {
                    if (item.is_active) {
                        cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, `networks:${item.network_token}`));
                    } else {
                        cache_keys_del.add(cacheService.keys.persons_grid_set(grid_token, `networks:${item.network_token}`));
                    }
                }

                if(!networksFilter.is_active || networksFilter.is_any_network) {
                    cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'send'));
                    cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'receive'));
                } else {
                    if(networksFilter.is_all_verified) {
                        for(let network of allNetworks.networks) {
                            if (network.is_verified) {
                                cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, `networks:${network.network_token}`));
                            } else {
                                cache_keys_del.add(cacheService.keys.persons_grid_set(grid_token, `networks:${network.network_token}`));
                            }
                        }
                    } else {
                        for(let network of allNetworks.networks) {
                            cache_keys_del.add(cacheService.keys.persons_grid_set(grid_token, `networks:${network.network_token}`));
                        }
                    }

                    if(networksFilter.is_send) {
                        if(networksFilter.is_any_network) {
                            cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'send'));
                        } else {
                            cache_keys_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'send'));
                        }
                    } else {
                        cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'send'));
                    }

                    if(networksFilter.is_receive) {
                        if(networksFilter.is_any_network) {
                            cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'receive'));
                        } else {
                            cache_keys_del.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'receive'));
                        }
                    } else {
                        cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, 'networks:any', 'receive'));
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
                let personModes = person.modes;
                let personSelectedModes = personModes?.selected || [];
                let modes = await getModes();
                let modesFilter = person_filters.modes;

                //person modes
                //validate partner
                if (personSelectedModes.includes('mode-partner')) {
                    if (!personModes?.partner ||
                        personModes.partner.deleted ||
                        !personModes.partner.gender_id) {
                        personSelectedModes = personSelectedModes.filter(item => item !== 'mode-partner');
                    }
                }

                //validate kids
                if (personSelectedModes.includes('mode-kids')) {
                    if (!personModes?.kids) {
                        personSelectedModes = personSelectedModes.filter(item => item !== 'mode-kids');
                    } else {
                        const hasValidKid = Object.values(personModes.kids).some(kid =>
                            !kid.deleted &&
                            kid.gender_id &&
                            kid.age_id &&
                            kid.is_active
                        );

                        if (!hasValidKid) {
                            personSelectedModes = personSelectedModes.filter(item => item !== 'mode-kids');
                        }
                    }
                }

                for(let mode of personSelectedModes) {
                    cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, `modes:${mode}`));
                }

                for(let mode of Object.values(modes.byId) || {}) {
                    cache_keys_del.add(cacheService.keys.persons_grid_set(grid_token, `modes:${mode.token}`));

                    cache_keys_del.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'send'));
                    cache_keys_del.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'receive'));

                    if(prev_grid_token) {
                        cache_keys_del.add(cacheService.keys.persons_grid_set(prev_grid_token, `modes:${mode.token}`));

                        cache_keys_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, mode.token, 'send'));
                        cache_keys_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, mode.token, 'receive'));
                    }

                    if(!modesFilter?.is_active) {
                        cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'send'));
                        cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'receive'));
                    } else {
                        let modeItem = Object.values(modesFilter.items || {})
                            .find(item => item.mode_id === mode.id);

                        if(modesFilter?.is_send) {
                            if(modeItem && modeItem.is_active && !modeItem.is_negative && !modeItem.deleted) {
                                cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'send'));
                            }
                        } else {
                            cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'send'));
                        }

                        if(modesFilter?.is_receive) {
                            if(modeItem && modeItem.is_active && !modeItem.is_negative && !modeItem.deleted) {
                                cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'receive'));
                            }
                        } else {
                            cache_keys_add.add(cacheService.keys.persons_grid_send_receive(grid_token, mode.token, 'receive'));
                        }
                    }
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
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

        cache_keys_add = new Set();
        cache_keys_del = new Set();

        rem_pipeline = cacheService.startPipeline();
        add_pipeline = cacheService.startPipeline();

        if(prev_grid_token) {
            // (1) networks
            cache_keys_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, 'networks:any', 'send'));
            cache_keys_del.add(cacheService.keys.persons_grid_send_receive(prev_grid_token, 'networks:any', 'receive'));

            for(let network of allNetworks.networks) {
                cache_keys_del.add(cacheService.keys.persons_grid_set(prev_grid_token, `networks:${network.network_token}`));
            }

            await updateNetworks();

            // (2) location
            cache_keys_del.add(cacheService.keys.persons_grid_set(prev_grid_token, 'location'));
            cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, 'location'));

            // (3) online
            cache_keys_del.add(cacheService.keys.persons_grid_set(prev_grid_token, 'online'));
            cache_keys_add.add(cacheService.keys.persons_grid_set(grid_token, 'online'));

            // (4) modes
            await updateModes();
        } else {
            //networks
            if(filter_token === 'networks') {
                await updateNetworks();
            }

            if(filter_token === 'modes') {
                await updateModes();
            }
        }

        try {
            if(cache_keys_del.size) {
                for(let key of cache_keys_del) {
                    rem_pipeline.sRem(key, person.person_token);
                }

                await cacheService.execPipeline(rem_pipeline);
            }

            if(cache_keys_add.size) {
                for(let key of cache_keys_add) {
                    add_pipeline.sAdd(key, person.person_token);
                }

                await cacheService.execPipeline(add_pipeline);
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
