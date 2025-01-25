const cacheService = require('./cache');
const dbService = require('./db');

const reviewsService = require('../services/reviews');

const lifeStageService = require('./life_stages');
const relationshipService = require('./relationships');
const politicsService = require('./politics');
const religionService = require('./religion');

const drinkingService = require('./drinking');
const smokingService = require('./smoking');

const { getModes, getPersonExcludedModes } = require('./modes');
const { getNetworksForFilters } = require('./network');
const { getGendersLookup } = require('./genders');
const { isNumeric } = require('./shared');

const filterMappings = {
    availability: {
        token: 'availability',
        name: 'Availability',
        filters_table: 'persons_availability',
        multi: true,
        is_notifications: true
    },
    activity_types: {
        token: 'activity_types',
        name: 'Activity Types',
        table: 'activity_types',
        column: 'activity_type_id',
        column_token: 'activity_type_token',
        column_name: 'notification_name',
        multi: true,
        is_notifications: true,
    },
    modes: {
        token: 'modes',
        name: 'Modes',
        table: 'modes',
        column: 'mode_id',
        multi: true,
        is_notifications: true,
    },
    networks: {
        token: 'networks',
        name: 'Networks',
        table: 'networks',
        column: 'network_id',
        filters_table: 'persons_filters_networks',
        multi: true,
        is_notifications: true,
    },
    reviews: {
        token: 'reviews',
        name: 'Reviews',
        single: true,
        is_notifications: true,
    },
    reviews_new: {
        token: 'reviews_new',
        name: 'New',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    reviews_safety: {
        token: 'reviews_safety',
        name: 'Safety',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    reviews_trust: {
        token: 'reviews_trust',
        name: 'Trust',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    reviews_timeliness: {
        token: 'reviews_timeliness',
        name: 'Timeliness',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    reviews_friendliness: {
        token: 'reviews_friendliness',
        name: 'Friendliness',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    reviews_fun: {
        token: 'reviews_fun',
        name: 'Fun',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verifications: {
        token: 'verifications',
        name: 'Verifications',
        single: true,
        is_notifications: true,
    },
    verification_in_person: {
        token: 'verification_in_person',
        name: 'In-Person',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verification_linkedin: {
        token: 'verification_linkedin',
        name: 'LinkedIn',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verification_dl: {
        token: 'verification_dl',
        name: "Driver's License",
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verification_cc: {
        token: 'verification_cc',
        name: 'Credit Card',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verification_video: {
        token: 'verification_video',
        name: 'Video',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    verification_mailer: {
        token: 'verification_mailer',
        name: 'Mail',
        single: true,
        is_notifications: true,
        is_sub: true,
    },
    distance: {
        token: 'distance',
        name: 'Distance',
        single: true,
        is_general: true,
    },
    ages: {
        token: 'ages',
        name: 'Age',
        single: true,
        is_general: true,
    },
    genders: {
        token: 'genders',
        name: 'Gender',
        table: 'genders',
        column: 'gender_id',
        column_token: 'gender_token',
        column_name: 'gender_name',
        multi: true,
        is_general: true,
    },
    movies: {
        token: 'movies',
        name: 'Movies',
        table: 'movies',
        table_key: 'movies',
        column: 'movie_id',
        multi: true,
        importance: true,
        is_interests: true,
        cache: {
            type: 'hash',
            key: cacheService.keys.movies,
        }
    },
    movie_genres: {
        token: 'movie_genres',
        name: 'Movie Genres',
        table: 'movie_genres',
        table_key: 'genres',
        column: 'movie_genre_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'movies',
        cache: {
            type: 'hash',
            key: cacheService.keys.movie_genres,
        }
    },
    tv_shows: {
        token: 'tv_shows',
        name: 'TV Shows',
        table: 'tv_shows',
        table_key: 'shows',
        column: 'tv_show_id',
        multi: true,
        importance: true,
        is_interests: true,
        cache: {
            type: 'hash',
            key: cacheService.keys.tv_shows,
        }
    },
    tv_show_genres: {
        token: 'tv_show_genres',
        name: 'TV Show Genres',
        table: 'tv_genres',
        table_key: 'genres',
        column: 'tv_show_genre_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'tv_shows',
        cache: {
            type: 'hash',
            key: cacheService.keys.tv_genres,
        }
    },
    sports: {
        token: 'sports',
        name: 'Sports',
        multi: true,
        importance: true,
        is_interests: true,
        cache: {
            type: 'hash',
            key: cacheService.keys.sports,
        }
    },
    sports_play: {
        token: 'sports_play',
        name: 'Play',
        table: 'sports',
        table_key: 'play',
        column: 'sport_play_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'sports',
        cache: {
            type: 'hash',
            key: cacheService.keys.sports,
        }
    },
    sports_leagues: {
        token: 'sports_league',
        name: 'Leagues',
        table: 'sports_leagues',
        table_key: 'leagues',
        column: 'sport_league_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'sports',
        cache: {
            type: 'hash',
            key: cacheService.keys.sports_leagues,
        }
    },
    sports_teams: {
        token: 'sports_team',
        name: 'Teams',
        table: 'sports_teams',
        table_key: 'teams',
        column: 'sport_team_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'sports',
        cache: {
            type: 'hash',
            key: cacheService.keys.sports_teams,
        }
    },
    music: {
        token: 'music',
        name: 'Music',
        multi: true,
        importance: true,
        is_interests: true,
    },
    music_artists: {
        token: 'music_artists',
        name: 'Music Artists',
        table: 'music_artists',
        table_key: 'artists',
        column: 'music_artist_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'music',
        cache: {
            type: 'hash',
            key: cacheService.keys.music_artists,
        }
    },
    music_genres: {
        token: 'music_genres',
        name: 'Music Genres',
        table: 'music_genres',
        table_key: 'genres',
        column: 'music_genre_id',
        multi: true,
        importance: true,
        is_interests: true,
        is_sub: true,
        parent_cache: 'music',
        cache: {
            type: 'hash',
            key: cacheService.keys.music_genres,
        }
    },
    instruments: {
        token: 'instruments',
        name: 'Instruments',
        table: 'instruments',
        column: 'instrument_id',
        multi: true,
        importance: true,
        is_interests: true,
        cache: {
            type: 'hash',
            key: cacheService.keys.instruments,
        }
    },
    schools: {
        token: 'schools',
        name: 'Schools',
        table: 'schools',
        column: 'school_id',
        multi: true,
        importance: true,
        is_school_work: true,
        cache: {
            type: 'hash_token',
            key: cacheService.keys.schools_country,
        }
    },
    work: {
        token: 'work',
        name: 'Work',
        multi: true,
        importance: true,
        is_school_work: true,
    },
    work_industries: {
        token: 'work_industries',
        name: 'Industry',
        table: 'work_industries',
        table_key: 'industries',
        column: 'work_industry_id',
        multi: true,
        importance: true,
        is_school_work: true,
        is_sub: true,
        parent_cache: 'work',
        cache: {
            type: 'hash',
            key: cacheService.keys.work_industries,
        }
    },
    work_roles: {
        token: 'work_roles',
        name: 'Role',
        table: 'work_roles',
        table_key: 'roles',
        column: 'work_role_id',
        multi: true,
        importance: true,
        is_school_work: true,
        is_sub: true,
        parent_cache: 'work',
        cache: {
            type: 'hash',
            key: cacheService.keys.work_roles,
        }
    },
    life_stages: {
        token: 'life_stages',
        name: 'Life Stages',
        table: 'life_stages',
        column: 'life_stage_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    relationships: {
        token: 'relationships',
        name: 'Relationships',
        table: 'relationship_status',
        column: 'relationship_status_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    languages: {
        token: 'languages',
        name: 'Languages',
        table: 'languages',
        column: 'language_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    politics: {
        token: 'politics',
        name: 'Politics',
        table: 'politics',
        column: 'politics_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    religion: {
        token: 'religion',
        name: 'Religion',
        table: 'religions',
        column: 'religion_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    drinking: {
        token: 'drinking',
        name: 'Drinking',
        table: 'drinking',
        column: 'drinking_id',
        multi: true,
        importance: true,
        is_personal: true,
    },
    smoking: {
        token: 'smoking',
        name: 'Smoking',
        table: 'smoking',
        column: 'smoking_id',
        multi: true,
        importance: true,
        is_personal: true,
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

function processFilterRows(rows) {
    return new Promise(async (resolve, reject) => {
        try {
            let filters = await module.exports.getFilters();

            let person_filters = {};
            let groupedRows = {};

            // Group rows by filter token
            for (let row of rows) {
                let filter = filters.byId[row.filter_id];
                if (!filter) continue;

                if (!groupedRows[filter.token]) {
                    groupedRows[filter.token] = [];
                }
                groupedRows[filter.token].push(row);
            }

            // Process each filter group
            for (let filter_token in groupedRows) {
                const rows = groupedRows[filter_token];
                const mapping = filterMappings[filter_token];
                if (!mapping) continue;

                // Get base properties from first row
                const baseRow = rows[0];
                let filterEntry = {
                    id: baseRow.id,
                    filter_id: baseRow.filter_id,
                    is_send: baseRow.is_send,
                    is_receive: baseRow.is_receive,
                    is_active: baseRow.is_active,
                    created: baseRow.created,
                    updated: baseRow.updated,
                };

                // Handle multi vs single filters
                if (mapping.multi) {
                    person_filters[filter_token] = {
                        ...filterEntry,
                        items: {},
                    };

                    // Process each item
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

                        // Add filter values
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

            resolve(person_filters);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonFilterForKey(person, filter_key) {
    return new Promise(async (resolve, reject) => {
        try {
            if (filter_key === null) {
                return reject();
            }
            let cache_key = cacheService.keys.person_filters(person.person_token);

            let filter = await cacheService.hGetItem(cache_key, filter_key);

            if (filter) {
                return resolve(filter);
            }

            // If not in cache, get all filters and filter by key
            let filters = await module.exports.getFilters();
            let filter_id = filters.byToken[filter_key]?.id;

            if (!filter_id) {
                return reject("Filter doesn't exist");
            }

            let conn = await dbService.conn();

            let qry = await conn('persons_filters')
                .where('person_id', person.id)
                .where('filter_id', filter_id);

            if (!qry.length) {
                return resolve(null);
            }

            let person_filters = await processFilterRows(qry);
            let filter_data = person_filters[filter_key] || null;

            // Cache the individual filter
            if (filter_data) {
                await cacheService.hSet(cache_key, filter_key, filter_data);
            }

            resolve(filter_data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonFilters(person) {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.person_filters(person.person_token);

            let person_filters = await cacheService.hGetAllObj(cache_key);

            if (person_filters) {
                return resolve(person_filters);
            }

            // If not in cache, build from database
            let conn = await dbService.conn();
            let qry = await conn('persons_filters').where('person_id', person.id);

            if (qry.length) {
                person_filters = await processFilterRows(qry);

                // Update cache with active filters
                await cacheService.hSet(cache_key, null, person_filters);
            }

            resolve(person_filters || {});
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonsFiltersBatch(persons) {
    return new Promise(async (resolve, reject) => {
        try {
            let pipeline = cacheService.startPipeline();

            for(let personObj of persons) {
                pipeline.hGetAll(cacheService.keys.person_filters(personObj.person.person_token));
            }

            let results = await cacheService.execPipeline(pipeline);

            for(let i = 0; i < persons.length; i++) {
                persons[i].filters = cacheService.parseHashData(results[i]);
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function updateGridSets(person, person_filters = null, filter_token, prev_grid_token = null) {
    let grid_token, addKeysSet, delKeysSet, keysDelSorted, keysAddSorted, pipelineRem, pipelineAdd;

    function updateOnline() {
        if (prev_grid_token) {
            delKeysSet.add(cacheService.keys.persons_grid_exclude(prev_grid_token, 'online'));
        }

        if (person.is_online) {
            delKeysSet.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
        } else {
            addKeysSet.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
        }
    }

    function updateLocation() {
        return new Promise(async (resolve, reject) => {
            if (prev_grid_token) {
                delKeysSet.add(cacheService.keys.persons_grid_set(prev_grid_token, 'location'));
            }

            addKeysSet.add(cacheService.keys.persons_grid_set(grid_token, 'location'));

            resolve();
        });
    }

    function updateNetworks() {
        return new Promise(async (resolve, reject) => {
            try {
                let allNetworks = await getNetworksForFilters();
                let network_token = allNetworks.networks?.find(
                    (network) => network.id === person.network_id,
                )?.network_token;

                if (!network_token) {
                    console.error('Network token not found');

                    return resolve();
                }

                const networksFilter = person_filters.networks;

                if (!networksFilter) {
                    return resolve();
                }

                let include_networks = new Set();
                let exclude_networks = new Set();

                for (let item of Object.values(networksFilter.items || {})) {
                    //skip own network
                    if (item.network_token === network_token) {
                        continue;
                    }

                    if (item.is_active) {
                        include_networks.add(item.network_token);
                    } else {
                        exclude_networks.add(item.network_token);
                    }
                }

                if (networksFilter.is_all_verified) {
                    for (let network of allNetworks.networks) {
                        if (network.network_token === network_token) {
                            continue;
                        }

                        if (network.is_verified) {
                            if (exclude_networks.has(network.network_token)) {
                                exclude_networks.delete(network.network_token);
                            }
                        } else {
                            if (!include_networks.has(network.network_token)) {
                                exclude_networks.add(network.network_token);
                            }
                        }
                    }
                }

                for (let network of allNetworks.networks) {
                    if (network.network_token === network_token) {
                        continue;
                    }

                    if (!networksFilter.is_active || networksFilter.is_any_network) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `networks:${network.network_token}`,
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `networks:${network.network_token}`,
                                'receive',
                            ),
                        );
                    } else {
                        //send
                        if (!networksFilter.is_send) {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `networks:${network.network_token}`,
                                    'send',
                                ),
                            );
                        } else {
                            if (include_networks.has(network.network_token)) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                        'send',
                                    ),
                                );
                            } else if (exclude_networks.has(network.network_token)) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                    ),
                                    'send',
                                );
                            }
                        }

                        //receive
                        if (!networksFilter.is_receive) {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `networks:${network.network_token}`,
                                ),
                                'receive',
                            );
                        } else {
                            if (include_networks.has(network.network_token)) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                    ),
                                    'receive',
                                );
                            } else if (exclude_networks.has(network.network_token)) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                    ),
                                    'receive',
                                );
                            }
                        }
                    }
                }

                if (prev_grid_token) {
                    for (let network of allNetworks.networks) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `networks:${network.network_token}`,
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `networks:${network.network_token}`,
                                'receive',
                            ),
                        );
                    }
                }
            } catch (e) {
                console.error(e);
            }

            resolve();
        });
    }

    function updateReviews() {
        return new Promise(async (resolve, reject) => {
            try {
                const reviewTypes = ['safety', 'trust', 'timeliness', 'friendliness', 'fun'];

                let reviews_filters = {
                    reviews: null, // top-level
                    new: null, // new matches
                };

                for (let type of reviewTypes) {
                    //review types
                    reviews_filters[type] = null;
                }

                let pipeline = cacheService.startPipeline();

                let filter_key = cacheService.keys.person_filters(person.person_token);

                pipeline.hGet(filter_key, `reviews`);
                pipeline.hGet(filter_key, `reviews_new`);

                for (let type of reviewTypes) {
                    pipeline.hGet(filter_key, `reviews_${type}`);
                }

                let results = await cacheService.execPipeline(pipeline);

                let idx = 0;

                let reviews_filter = results[idx++];
                let new_filter = results[idx++];

                reviews_filters.reviews = reviews_filter ? JSON.parse(reviews_filter) : null;
                reviews_filters.new = new_filter ? JSON.parse(new_filter) : null;

                for (let type of reviewTypes) {
                    let data = results[idx++];

                    if (data) {
                        reviews_filters[type] = JSON.parse(data);
                    } else {
                        reviews_filters[type] = null;
                    }
                }

                if (prev_grid_token) {
                    if (person.is_new) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(prev_grid_token, `is_new_person`),
                        );
                        addKeysSet.add(
                            cacheService.keys.persons_grid_set(grid_token, `is_new_person`),
                        );
                    }

                    //excluded match with new
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            prev_grid_token,
                            `reviews:match_new`,
                            'send',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            prev_grid_token,
                            `reviews:match_new`,
                            'receive',
                        ),
                    );

                    for (let type of reviewTypes) {
                        //own rating
                        keysDelSorted.add(
                            cacheService.keys.persons_grid_sorted(
                                prev_grid_token,
                                `reviews:${type}`,
                            ),
                        );

                        //filters
                        keysDelSorted.add(
                            cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                prev_grid_token,
                                `reviews:${type}`,
                                'send',
                            ),
                        );

                        keysDelSorted.add(
                            cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                prev_grid_token,
                                `reviews:${type}`,
                                'receive',
                            ),
                        );
                    }
                }

                //new person
                if (person.is_new) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, `is_new_person`),
                    );
                }

                //remove self from previous exclude keys
                delKeysSet.add(
                    cacheService.keys.persons_grid_exclude_send_receive(
                        grid_token,
                        `reviews:match_new`,
                        'send',
                    ),
                );
                delKeysSet.add(
                    cacheService.keys.persons_grid_exclude_send_receive(
                        grid_token,
                        `reviews:match_new`,
                        'receive',
                    ),
                );

                for (let type of reviewTypes) {
                    keysDelSorted.add(
                        cacheService.keys.persons_grid_exclude_sorted_send_receive(
                            grid_token,
                            `reviews:${type}`,
                            'send',
                        ),
                    );

                    keysDelSorted.add(
                        cacheService.keys.persons_grid_exclude_sorted_send_receive(
                            grid_token,
                            `reviews:${type}`,
                            'receive',
                        ),
                    );
                }

                //exclude matching with new members
                if (reviews_filters.reviews?.is_active) {
                    if (reviews_filters.new && !reviews_filters.new.is_active) {
                        if (reviews_filters.new.is_send) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `reviews:match_new`,
                                    'send',
                                ),
                            );
                        }

                        if (reviews_filters.new.is_receive) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `reviews:match_new`,
                                    'receive',
                                ),
                            );
                        }
                    }
                }

                for (let type of reviewTypes) {
                    let rating = person.reviews?.[type];
                    let filter = reviews_filters[type];

                    //add own rating
                    if (isNumeric(rating)) {
                        keysAddSorted.add({
                            key: cacheService.keys.persons_grid_sorted(
                                grid_token,
                                `reviews:${type}`,
                            ),
                            score: rating.toString(),
                        });
                    }

                    //main reviews filter active state
                    if (!reviews_filters.reviews?.is_active) {
                        continue;
                    }

                    if (filter?.is_active) {
                        //use custom filter value or default
                        let value = filter.filter_value || reviewsService.filters.default;

                        if (!isNumeric(value)) {
                            continue;
                        }

                        if (filter.is_send) {
                            keysAddSorted.add({
                                key: cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                    grid_token,
                                    `reviews:${type}`,
                                    'send',
                                ),
                                score: value.toString(),
                            });
                        }

                        if (filter.is_receive) {
                            keysAddSorted.add({
                                key: cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                    grid_token,
                                    `reviews:${type}`,
                                    'receive',
                                ),
                                score: value.toString(),
                            });
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    function updateModes() {
        return new Promise(async (resolve, reject) => {
            try {
                let modes = await getModes();

                let excluded_modes = await getPersonExcludedModes(person, person_filters);

                for (let mode of Object.values(modes.byId) || {}) {
                    //person sets
                    delKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, mode.token)
                    );
                    
                    //filter sets
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode.token}`,
                            'send',
                        ),
                    );

                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode.token}`,
                            'receive',
                        ),
                    );

                    if (prev_grid_token) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(prev_grid_token, mode.token)
                        );
                        
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `modes:${mode.token}`,
                                'send',
                            ),
                        );

                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `modes:${mode.token}`,
                                'receive',
                            ),
                        );
                    }
                }
                
                //person sets
                if(person.modes?.selected?.length) {
                    for(let mode_token of person.modes.selected) {
                        addKeysSet.add(
                            cacheService.keys.persons_grid_set(grid_token, mode_token)
                        );
                    }
                }

                for (let mode_token of excluded_modes.send) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode_token}`,
                            'send',
                        ),
                    );
                }

                for (let mode_token of excluded_modes.receive) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `modes:${mode_token}`,
                            'receive',
                        ),
                    );
                }
            } catch (e) {
                console.error(e);
            }

            resolve();
        });
    }

    function updateVerifications() {
        return new Promise(async (resolve, reject) => {
            try {
                const verificationTypes = ['in_person', 'linkedin'];

                if (person.is_verified_in_person) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, `verified:in_person`),
                    );
                } else {
                    delKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, `verified:in_person`),
                    );
                }

                if (person.is_verified_linkedin) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`),
                    );
                } else {
                    delKeysSet.add(
                        cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`),
                    );
                }

                if (!person_filters.verifications?.is_active) {
                    delKeysSet.add(
                        cacheService.keys.persons_grid_send_receive(
                            grid_token,
                            'verifications:in_person',
                            'send',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_send_receive(
                            grid_token,
                            'verifications:in_person',
                            'receive',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_send_receive(
                            grid_token,
                            'verifications:linkedin',
                            'send',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_send_receive(
                            grid_token,
                            'verifications:linkedin',
                            'receive',
                        ),
                    );
                } else {
                    if (!person_filters.verification_in_person?.is_active) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                'verifications:in_person',
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                'verifications:in_person',
                                'receive',
                            ),
                        );
                    } else {
                        if (person_filters.verification_in_person.is_send) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'send',
                                ),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'send',
                                ),
                            );
                        }

                        if (person_filters.verification_in_person.is_receive) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'receive',
                                ),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'receive',
                                ),
                            );
                        }
                    }

                    if (!person_filters.verification_linkedin?.is_active) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                'verifications:linkedin',
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                'verifications:linkedin',
                                'receive',
                            ),
                        );
                    } else {
                        if (person_filters.verification_linkedin.is_send) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'send',
                                ),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'send',
                                ),
                            );
                        }

                        if (person_filters.verification_linkedin.is_receive) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'receive',
                                ),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'receive',
                                ),
                            );
                        }
                    }
                }

                if (prev_grid_token) {
                    for (let type of verificationTypes) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(prev_grid_token, `verified:${type}`),
                        );

                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                prev_grid_token,
                                `verifications:${type}`,
                                'send',
                            )
                        );

                        delKeysSet.add(
                            cacheService.keys.persons_grid_send_receive(
                                prev_grid_token,
                                `verifications:${type}`,
                                'receive',
                            ),
                        );
                    }
                }
            } catch (e) {
                console.error('Error in updateVerifications:', e);
            }

            resolve();
        });
    }

    function updateGenders() {
        return new Promise(async (resolve, reject) => {
            try {
                let genderFilter = person_filters.genders;

                let genders = await getGendersLookup();

                let person_gender = genders.byId[person.gender_id];

                for (let gender_token in genders.byToken) {
                    if (gender_token !== 'any') {
                        if (prev_grid_token) {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_set(
                                    prev_grid_token,
                                    `gender:${gender_token}`,
                                ),
                            );

                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    prev_grid_token,
                                    `genders:${gender_token}`,
                                    'send',
                                ),
                            );

                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    prev_grid_token,
                                    `genders:${gender_token}`,
                                    'receive',
                                ),
                            );
                        }

                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(
                                grid_token,
                                `gender:${gender_token}`,
                            ),
                        );

                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `genders:${gender_token}`,
                                'send',
                            ),
                        );

                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `genders:${gender_token}`,
                                'receive',
                            ),
                        );
                    }
                }

                if (person_gender) {
                    addKeysSet.add(
                        cacheService.keys.persons_grid_set(
                            grid_token,
                            `gender:${person_gender.gender_token}`,
                        ),
                    );
                }

                //filters
                if (!genderFilter) {
                    return resolve();
                }

                let anyId = genders.byToken['any']?.id;

                let anyItem = Object.values(genderFilter.items).find(
                    (item) => item.gender_id === anyId,
                );

                let isAnySelected = anyItem?.is_active && !anyItem.is_negative && !anyItem.deleted;

                //if any is selected, do not add self to excluded gender sets
                if (!isAnySelected && genderFilter.is_active) {
                    for (let gender_id in genders.byId) {
                        let gender = genders.byId[gender_id];

                        if (gender.gender_token === 'any') {
                            continue;
                        }

                        let genderItem = Object.values(genderFilter.items).find(
                            (item) => item.gender_id === parseInt(gender_id),
                        );

                        if (genderFilter.is_send) {
                            if (
                                !genderItem ||
                                !genderItem.is_active ||
                                genderItem.is_negative ||
                                genderItem.deleted
                            ) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `genders:${gender.gender_token}`,
                                        'send',
                                    ),
                                );
                            }
                        }

                        if (genderFilter.is_receive) {
                            if (
                                !genderItem ||
                                !genderItem.is_active ||
                                genderItem.is_negative ||
                                genderItem.deleted
                            ) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `genders:${gender.gender_token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    }

    function updateMultiFilter(sectionKey, getOptions, default_importance = 5, importance_threshold = 8) {
        return new Promise(async (resolve, reject) => {
            try {
                let section_options = await getOptions();
                let cache_key = cacheService.keys.person_sections(person.person_token);
                let section_data = (await cacheService.hGetItem(cache_key, sectionKey)) || {};

                let filter = person_filters[sectionKey];

                if (!filter) {
                    //try key without s
                    filter = person_filters[sectionKey.substring(0, sectionKey.length - 1)];
                }

                // Clear existing keys for this grid
                for (let option of section_options) {
                    if (prev_grid_token) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                                'receive',
                            ),
                        );
                    }

                    delKeysSet.add(
                        cacheService.keys.persons_grid_set(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'send',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'receive',
                        ),
                    );
                }

                // Add person's section items to grid sets
                for (let key in section_data) {
                    let item = section_data[key];

                    if (!item.deleted) {
                        addKeysSet.add(
                            cacheService.keys.persons_grid_set(
                                grid_token,
                                `${sectionKey}:${item.token}`,
                            ),
                        );
                    }
                }

                if (!filter?.is_active) {
                    return resolve();
                }

                let added_tokens = [];
                let is_high_importance = false;

                // Check selected filters for importance
                let filterItems = Object.values(filter.items);

                for (let item of filterItems) {
                    if (item.is_active && !item.is_negative && !item.deleted) {
                        added_tokens.push(item.token);

                        let importance = isNumeric(item.importance)
                            ? item.importance
                            : default_importance;

                        if (importance >= importance_threshold) {
                            is_high_importance = true;
                        }
                    }
                }

                // If high importance filters are set, exclude non-matching options
                if (is_high_importance) {
                    for (let option of section_options) {
                        if (!added_tokens.includes(option.token)) {
                            // Apply send exclusions
                            if (filter.is_send) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `${sectionKey}:${option.token}`,
                                        'send',
                                    ),
                                );
                            }

                            // Apply receive exclusions
                            if (filter.is_receive) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `${sectionKey}:${option.token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(`Error in update ${sectionKey}:`, e);
                return reject(e);
            }
        });
    }

    function updateSingleFilter(sectionKey, getOptions, default_importance = 5, importance_threshold = 8) {
        return new Promise(async (resolve, reject) => {
            try {
                let section_options = await getOptions();
                let cache_key = cacheService.keys.person_sections(person.person_token);
                let section_data = (await cacheService.hGetItem(cache_key, sectionKey)) || {};

                let filter = person_filters[sectionKey];

                if (!filter) {
                    //try key without s
                    filter = person_filters[sectionKey.substring(0, sectionKey.length - 1)];
                }

                // Clear existing keys for this grid
                for (let option of section_options) {
                    if (prev_grid_token) {
                        delKeysSet.add(
                            cacheService.keys.persons_grid_set(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                prev_grid_token,
                                `${sectionKey}:${option.token}`,
                                'receive',
                            ),
                        );
                    }

                    delKeysSet.add(
                        cacheService.keys.persons_grid_set(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'send',
                        ),
                    );
                    delKeysSet.add(
                        cacheService.keys.persons_grid_exclude_send_receive(
                            grid_token,
                            `${sectionKey}:${option.token}`,
                            'receive',
                        ),
                    );
                }

                // Add person's current selection to grid sets
                if (Object.keys(section_data).length) {
                    let item = Object.values(section_data)[0];
                    addKeysSet.add(
                        cacheService.keys.persons_grid_set(
                            grid_token,
                            `${sectionKey}:${item.token}`,
                        ),
                    );
                }

                if (!filter?.is_active || filter.is_any) {
                    return resolve();
                }

                let added_tokens = [];
                let is_high_importance = false;

                // Check selected filters for importance
                let filterItems = Object.values(filter.items);

                for (let item of filterItems) {
                    if (item.is_active && !item.is_negative && !item.deleted) {
                        added_tokens.push(item.token);

                        let importance = isNumeric(item.importance)
                            ? item.importance
                            : default_importance;

                        if (importance >= importance_threshold) {
                            is_high_importance = true;
                        }
                    }
                }

                // If high importance filters are set, exclude non-matching options
                if (is_high_importance) {
                    for (let option of section_options) {
                        if (!added_tokens.includes(option.token)) {
                            // Apply send exclusions
                            if (filter.is_send) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `${sectionKey}:${option.token}`,
                                        'send',
                                    ),
                                );
                            }

                            // Apply receive exclusions
                            if (filter.is_receive) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `${sectionKey}:${option.token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }
                    }
                }

                resolve();
            } catch (e) {
                console.error(`Error in update ${sectionKey}:`, e);
                reject(e);
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        if (!person) {
            return reject();
        }

        if (!person.grid?.token) {
            console.error('Grid token required');
            return resolve();
        }

        grid_token = person.grid.token;

        try {
            if (!person_filters) {
                if (prev_grid_token) {
                    person_filters = await getPersonFilters(person);
                } else {
                    if (!['online', 'location'].includes(filter_token)) {
                        let filter = await getPersonFilterForKey(person, filter_token);

                        person_filters = {
                            [filter_token]: filter,
                        };
                    }
                }
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        addKeysSet = new Set();
        delKeysSet = new Set();

        keysAddSorted = new Set();
        keysDelSorted = new Set();

        pipelineRem = cacheService.startPipeline();
        pipelineAdd = cacheService.startPipeline();

        if (prev_grid_token) {
            await updateOnline();

            await updateLocation();

            await updateModes();

            await updateNetworks();

            await updateReviews();

            await updateVerifications();

            await updateGenders();

            //personal
            await updateMultiFilter(
                'life_stages',
                lifeStageService.getLifeStages,
                lifeStageService.importance.default,
            );

            await updateMultiFilter(
                'relationships',
                relationshipService.getRelationshipStatus,
                relationshipService.importance.default,
            );

            await updateSingleFilter(
                'politics',
                politicsService.getPolitics,
                politicsService.importance.default,
            );

            await updateMultiFilter(
                'religion',
                religionService.getReligions,
                religionService.importance.default,
            );

            await updateSingleFilter(
                'drinking',
                drinkingService.getDrinking,
                drinkingService.importance.default,
            );

            await updateSingleFilter(
                'smoking',
                smokingService.getSmoking,
                smokingService.importance.default,
            );
        } else {
            if (filter_token === 'online') {
                await updateOnline();
            }

            if (filter_token === 'location') {
                await updateLocation();
            }

            if (filter_token === 'modes') {
                await updateModes();
            }

            if (filter_token === 'networks') {
                await updateNetworks();
            }

            if (filter_token.startsWith('review')) {
                await updateReviews();
            }

            if (filter_token === 'verifications') {
                await updateVerifications();
            }

            if (filter_token === 'genders') {
                await updateGenders();
            }

            if (filter_token.startsWith('life_stage')) {
                await updateMultiFilter(
                    'life_stages',
                    lifeStageService.getLifeStages,
                    lifeStageService.importance.default,
                );
            }

            if (filter_token.startsWith('relationships')) {
                await updateMultiFilter(
                    'relationships',
                    relationshipService.getRelationshipStatus,
                    relationshipService.importance.default,
                );
            }

            if (filter_token.startsWith('politic')) {
                await updateSingleFilter(
                    'politics',
                    politicsService.getPolitics,
                    politicsService.importance.default,
                );
            }

            if (filter_token.startsWith('religion')) {
                await updateMultiFilter(
                    'religion',
                    religionService.getReligions,
                    religionService.importance.default,
                );
            }

            if (filter_token === 'drinking') {
                await updateSingleFilter(
                    'drinking',
                    drinkingService.getDrinking,
                    drinkingService.importance.default,
                );
            }

            if (filter_token === 'smoking') {
                await updateSingleFilter(
                    'smoking',
                    smokingService.getSmoking,
                    smokingService.importance.default,
                );
            }
        }

        try {
            if (delKeysSet.size) {
                for (let key of delKeysSet) {
                    pipelineRem.sRem(key, person.person_token);
                }

                await cacheService.execPipeline(pipelineRem);
            }

            if (keysDelSorted.size) {
                for (let key of keysDelSorted) {
                    pipelineRem.zRem(key, person.person_token);
                }

                await cacheService.execPipeline(pipelineRem);
            }

            if (addKeysSet.size) {
                for (let key of addKeysSet) {
                    pipelineAdd.sAdd(key, person.person_token);
                }

                await cacheService.execPipeline(pipelineAdd);
            }

            if (keysAddSorted.size) {
                for (let data of keysAddSorted) {
                    pipelineAdd.zAdd(data.key, {
                        value: person.person_token,
                        score: data.score,
                    });
                }

                await cacheService.execPipeline(pipelineAdd);
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function batchUpdateGridSets(persons) {
    return new Promise(async (resolve, reject) => {
        let modes, genders, allNetworks;

        if (!persons?.length) {
            return resolve();
        }

        try {
            modes = await getModes();

            genders = await getGendersLookup();

            allNetworks = await getNetworksForFilters();

            await getPersonsFiltersBatch(persons);
        } catch (e) {
            console.error(e);
            return reject();
        }

        let hasPipelineRem = false;
        let hasPipelineAdd = false;
        let pipelineRem = cacheService.startPipeline();
        let pipelineAdd = cacheService.startPipeline();

        for(let personObj of persons) {
            let grid_token = personObj.grid?.token;
            let prev_grid_token = personObj.prev_grid?.token;

            let person = personObj.person;
            let filters = personObj.filters;
            let filter_tokens = personObj.filter_tokens;

            let addKeysSet = new Set();
            let delKeysSet = new Set();

            let keysAddSorted = new Set();
            let keysDelSorted = new Set();

            function updateAll() {
                return new Promise(async (resolve, reject) => {
                    await updateOnline();

                    await updateLocation();

                    await updateModes();

                    await updateNetworks();

                    await updateReviews();

                    await updateVerifications();

                    await updateGenders();
                    resolve();
                });
            }

            function updateOnline() {
                return new Promise(async (resolve, reject) => {
                    if (prev_grid_token) {
                        delKeysSet.add(cacheService.keys.persons_grid_exclude(prev_grid_token, 'online'));
                    }

                    if (person.is_online) {
                        delKeysSet.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
                    } else {
                        addKeysSet.add(cacheService.keys.persons_grid_exclude(grid_token, 'online'));
                    }

                    resolve();
                });
            }

            function updateLocation() {
                return new Promise(async (resolve, reject) => {
                    if (prev_grid_token) {
                        delKeysSet.add(cacheService.keys.persons_grid_set(prev_grid_token, 'location'));
                    }

                    addKeysSet.add(cacheService.keys.persons_grid_set(grid_token, 'location'));

                    resolve();
                });
            }

            function updateReviews() {
                return new Promise(async (resolve, reject) => {
                    try {
                        const reviewTypes = ['safety', 'trust', 'timeliness', 'friendliness', 'fun'];

                        let reviews_filters = {
                            reviews: null, // top-level
                            new: null, // new matches
                        };

                        for (let type of reviewTypes) {
                            //review types
                            reviews_filters[type] = null;
                        }

                        let pipeline = cacheService.startPipeline();

                        let filter_key = cacheService.keys.person_filters(person.person_token);

                        pipeline.hGet(filter_key, `reviews`);
                        pipeline.hGet(filter_key, `reviews_new`);

                        for (let type of reviewTypes) {
                            pipeline.hGet(filter_key, `reviews_${type}`);
                        }

                        let results = await cacheService.execPipeline(pipeline);

                        let idx = 0;

                        let reviews_filter = results[idx++];
                        let new_filter = results[idx++];

                        reviews_filters.reviews = reviews_filter ? JSON.parse(reviews_filter) : null;
                        reviews_filters.new = new_filter ? JSON.parse(new_filter) : null;

                        for (let type of reviewTypes) {
                            let data = results[idx++];

                            if (data) {
                                reviews_filters[type] = JSON.parse(data);
                            } else {
                                reviews_filters[type] = null;
                            }
                        }

                        if (prev_grid_token) {
                            if (person.is_new) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_set(prev_grid_token, `is_new_person`),
                                );
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_set(grid_token, `is_new_person`),
                                );
                            }

                            //excluded match with new
                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    prev_grid_token,
                                    `reviews:match_new`,
                                    'send',
                                ),
                            );
                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    prev_grid_token,
                                    `reviews:match_new`,
                                    'receive',
                                ),
                            );

                            for (let type of reviewTypes) {
                                //own rating
                                keysDelSorted.add(
                                    cacheService.keys.persons_grid_sorted(
                                        prev_grid_token,
                                        `reviews:${type}`,
                                    ),
                                );

                                //filters
                                keysDelSorted.add(
                                    cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                        prev_grid_token,
                                        `reviews:${type}`,
                                        'send',
                                    ),
                                );

                                keysDelSorted.add(
                                    cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                        prev_grid_token,
                                        `reviews:${type}`,
                                        'receive',
                                    ),
                                );
                            }
                        }

                        //new person
                        if (person.is_new) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, `is_new_person`),
                            );
                        }

                        //remove self from previous exclude keys
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `reviews:match_new`,
                                'send',
                            ),
                        );
                        delKeysSet.add(
                            cacheService.keys.persons_grid_exclude_send_receive(
                                grid_token,
                                `reviews:match_new`,
                                'receive',
                            ),
                        );

                        for (let type of reviewTypes) {
                            keysDelSorted.add(
                                cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                    grid_token,
                                    `reviews:${type}`,
                                    'send',
                                ),
                            );

                            keysDelSorted.add(
                                cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                    grid_token,
                                    `reviews:${type}`,
                                    'receive',
                                ),
                            );
                        }

                        //exclude matching with new members
                        if (reviews_filters.reviews?.is_active) {
                            if (reviews_filters.new && !reviews_filters.new.is_active) {
                                if (reviews_filters.new.is_send) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            grid_token,
                                            `reviews:match_new`,
                                            'send',
                                        ),
                                    );
                                }

                                if (reviews_filters.new.is_receive) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            grid_token,
                                            `reviews:match_new`,
                                            'receive',
                                        ),
                                    );
                                }
                            }
                        }

                        for (let type of reviewTypes) {
                            let rating = person.reviews?.[type];
                            let filter = reviews_filters[type];

                            //add own rating
                            if (isNumeric(rating)) {
                                keysAddSorted.add({
                                    key: cacheService.keys.persons_grid_sorted(
                                        grid_token,
                                        `reviews:${type}`,
                                    ),
                                    score: rating.toString(),
                                });
                            }

                            //main reviews filter active state
                            if (!reviews_filters.reviews?.is_active) {
                                continue;
                            }

                            if (filter?.is_active) {
                                //use custom filter value or default
                                let value = filter.filter_value || reviewsService.filters.default;

                                if (!isNumeric(value)) {
                                    continue;
                                }

                                if (filter.is_send) {
                                    keysAddSorted.add({
                                        key: cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                            grid_token,
                                            `reviews:${type}`,
                                            'send',
                                        ),
                                        score: value.toString(),
                                    });
                                }

                                if (filter.is_receive) {
                                    keysAddSorted.add({
                                        key: cacheService.keys.persons_grid_exclude_sorted_send_receive(
                                            grid_token,
                                            `reviews:${type}`,
                                            'receive',
                                        ),
                                        score: value.toString(),
                                    });
                                }
                            }
                        }

                        resolve();
                    } catch (e) {
                        console.error(e);
                        return reject(e);
                    }
                });
            }

            function updateModes() {
                return new Promise(async (resolve, reject) => {
                    try {
                        let excluded_modes = await getPersonExcludedModes(person, filters);

                        for (let mode of Object.values(modes.byId) || {}) {
                            //person sets
                            delKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, mode.token)
                            );

                            //filter sets
                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `modes:${mode.token}`,
                                    'send',
                                ),
                            );

                            delKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `modes:${mode.token}`,
                                    'receive',
                                ),
                            );

                            if (prev_grid_token) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_set(prev_grid_token, mode.token)
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        prev_grid_token,
                                        `modes:${mode.token}`,
                                        'send',
                                    ),
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        prev_grid_token,
                                        `modes:${mode.token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }

                        //person sets
                        if(person.modes?.selected?.length) {
                            for(let mode_token of person.modes.selected) {
                                addKeysSet.add(
                                    cacheService.keys.persons_grid_set(grid_token, mode_token)
                                );
                            }
                        }

                        for (let mode_token of excluded_modes.send) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `modes:${mode_token}`,
                                    'send',
                                ),
                            );
                        }

                        for (let mode_token of excluded_modes.receive) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_exclude_send_receive(
                                    grid_token,
                                    `modes:${mode_token}`,
                                    'receive',
                                ),
                            );
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    resolve();
                });
            }

            function updateNetworks() {
                return new Promise(async (resolve, reject) => {
                    try {
                        let network_token = allNetworks.networks?.find(
                            (network) => network.id === person.network_id,
                        )?.network_token;

                        if (!network_token) {
                            console.error('Network token not found');

                            return resolve();
                        }

                        const networksFilter = filters.networks;

                        if (!networksFilter) {
                            return resolve();
                        }

                        let include_networks = new Set();
                        let exclude_networks = new Set();

                        for (let item of Object.values(networksFilter.items || {})) {
                            //skip own network
                            if (item.network_token === network_token) {
                                continue;
                            }

                            if (item.is_active) {
                                include_networks.add(item.network_token);
                            } else {
                                exclude_networks.add(item.network_token);
                            }
                        }

                        if (networksFilter.is_all_verified) {
                            for (let network of allNetworks.networks) {
                                if (network.network_token === network_token) {
                                    continue;
                                }

                                if (network.is_verified) {
                                    if (exclude_networks.has(network.network_token)) {
                                        exclude_networks.delete(network.network_token);
                                    }
                                } else {
                                    if (!include_networks.has(network.network_token)) {
                                        exclude_networks.add(network.network_token);
                                    }
                                }
                            }
                        }

                        for (let network of allNetworks.networks) {
                            if (network.network_token === network_token) {
                                continue;
                            }

                            if (!networksFilter.is_active || networksFilter.is_any_network) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                        'send',
                                    ),
                                );
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `networks:${network.network_token}`,
                                        'receive',
                                    ),
                                );
                            } else {
                                //send
                                if (!networksFilter.is_send) {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            grid_token,
                                            `networks:${network.network_token}`,
                                            'send',
                                        ),
                                    );
                                } else {
                                    if (include_networks.has(network.network_token)) {
                                        delKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `networks:${network.network_token}`,
                                                'send',
                                            ),
                                        );
                                    } else if (exclude_networks.has(network.network_token)) {
                                        addKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `networks:${network.network_token}`,
                                            ),
                                            'send',
                                        );
                                    }
                                }

                                //receive
                                if (!networksFilter.is_receive) {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            grid_token,
                                            `networks:${network.network_token}`,
                                        ),
                                        'receive',
                                    );
                                } else {
                                    if (include_networks.has(network.network_token)) {
                                        delKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `networks:${network.network_token}`,
                                            ),
                                            'receive',
                                        );
                                    } else if (exclude_networks.has(network.network_token)) {
                                        addKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `networks:${network.network_token}`,
                                            ),
                                            'receive',
                                        );
                                    }
                                }
                            }
                        }

                        if (prev_grid_token) {
                            for (let network of allNetworks.networks) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        prev_grid_token,
                                        `networks:${network.network_token}`,
                                        'send',
                                    ),
                                );
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        prev_grid_token,
                                        `networks:${network.network_token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    resolve();
                });
            }

            function updateVerifications() {
                return new Promise(async (resolve, reject) => {
                    try {
                        const verificationTypes = ['in_person', 'linkedin'];

                        if (person.is_verified_in_person) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, `verified:in_person`),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, `verified:in_person`),
                            );
                        }

                        if (person.is_verified_linkedin) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`),
                            );
                        } else {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_set(grid_token, `verified:linkedin`),
                            );
                        }

                        if (!filters?.verifications?.is_active) {
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'send',
                                ),
                            );
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:in_person',
                                    'receive',
                                ),
                            );
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'send',
                                ),
                            );
                            delKeysSet.add(
                                cacheService.keys.persons_grid_send_receive(
                                    grid_token,
                                    'verifications:linkedin',
                                    'receive',
                                ),
                            );
                        } else {
                            if (!filters?.verification_in_person?.is_active) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        'verifications:in_person',
                                        'send',
                                    ),
                                );
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        'verifications:in_person',
                                        'receive',
                                    ),
                                );
                            } else {
                                if (filters?.verification_in_person.is_send) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:in_person',
                                            'send',
                                        ),
                                    );
                                } else {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:in_person',
                                            'send',
                                        ),
                                    );
                                }

                                if (filters?.verification_in_person.is_receive) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:in_person',
                                            'receive',
                                        ),
                                    );
                                } else {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:in_person',
                                            'receive',
                                        ),
                                    );
                                }
                            }

                            if (!filters?.verification_linkedin?.is_active) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        'verifications:linkedin',
                                        'send',
                                    ),
                                );
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        'verifications:linkedin',
                                        'receive',
                                    ),
                                );
                            } else {
                                if (filters?.verification_linkedin.is_send) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:linkedin',
                                            'send',
                                        ),
                                    );
                                } else {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:linkedin',
                                            'send',
                                        ),
                                    );
                                }

                                if (filters?.verification_linkedin.is_receive) {
                                    addKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:linkedin',
                                            'receive',
                                        ),
                                    );
                                } else {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_send_receive(
                                            grid_token,
                                            'verifications:linkedin',
                                            'receive',
                                        ),
                                    );
                                }
                            }
                        }

                        if (prev_grid_token) {
                            for (let type of verificationTypes) {
                                delKeysSet.add(
                                    cacheService.keys.persons_grid_set(prev_grid_token, `verified:${type}`),
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        prev_grid_token,
                                        `verifications:${type}`,
                                        'send',
                                    )
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_send_receive(
                                        prev_grid_token,
                                        `verifications:${type}`,
                                        'receive',
                                    ),
                                );
                            }
                        }
                    } catch (e) {
                        console.error('Error in updateVerifications:', e);
                    }

                    resolve();
                });
            }

            function updateGenders() {
                return new Promise(async (resolve, reject) => {
                    try {
                        let genderFilter = filters?.genders;

                        let person_gender = genders.byId[person.gender_id];

                        for (let gender_token in genders.byToken) {
                            if (gender_token !== 'any') {
                                if (prev_grid_token) {
                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_set(
                                            prev_grid_token,
                                            `gender:${gender_token}`,
                                        ),
                                    );

                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            prev_grid_token,
                                            `genders:${gender_token}`,
                                            'send',
                                        ),
                                    );

                                    delKeysSet.add(
                                        cacheService.keys.persons_grid_exclude_send_receive(
                                            prev_grid_token,
                                            `genders:${gender_token}`,
                                            'receive',
                                        ),
                                    );
                                }

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_set(
                                        grid_token,
                                        `gender:${gender_token}`,
                                    ),
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `genders:${gender_token}`,
                                        'send',
                                    ),
                                );

                                delKeysSet.add(
                                    cacheService.keys.persons_grid_exclude_send_receive(
                                        grid_token,
                                        `genders:${gender_token}`,
                                        'receive',
                                    ),
                                );
                            }
                        }

                        if (person_gender) {
                            addKeysSet.add(
                                cacheService.keys.persons_grid_set(
                                    grid_token,
                                    `gender:${person_gender.gender_token}`,
                                ),
                            );
                        }

                        //filters
                        if (!genderFilter) {
                            return resolve();
                        }

                        let anyId = genders.byToken['any']?.id;

                        let anyItem = Object.values(genderFilter.items).find(
                            (item) => item.gender_id === anyId,
                        );

                        let isAnySelected = anyItem?.is_active && !anyItem.is_negative && !anyItem.deleted;

                        //if any is selected, do not add self to excluded gender sets
                        if (!isAnySelected && genderFilter.is_active) {
                            for (let gender_id in genders.byId) {
                                let gender = genders.byId[gender_id];

                                if (gender.gender_token === 'any') {
                                    continue;
                                }

                                let genderItem = Object.values(genderFilter.items).find(
                                    (item) => item.gender_id === parseInt(gender_id),
                                );

                                if (genderFilter.is_send) {
                                    if (
                                        !genderItem ||
                                        !genderItem.is_active ||
                                        genderItem.is_negative ||
                                        genderItem.deleted
                                    ) {
                                        addKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `genders:${gender.gender_token}`,
                                                'send',
                                            ),
                                        );
                                    }
                                }

                                if (genderFilter.is_receive) {
                                    if (
                                        !genderItem ||
                                        !genderItem.is_active ||
                                        genderItem.is_negative ||
                                        genderItem.deleted
                                    ) {
                                        addKeysSet.add(
                                            cacheService.keys.persons_grid_exclude_send_receive(
                                                grid_token,
                                                `genders:${gender.gender_token}`,
                                                'receive',
                                            ),
                                        );
                                    }
                                }
                            }
                        }

                        resolve();
                    } catch (e) {
                        console.error(e);
                        return reject();
                    }
                });
            }

            if (prev_grid_token) {
                await updateAll();
            } else {
                for(let filter_token of filter_tokens) {
                    if (filter_token === 'online') {
                        await updateOnline();
                    }

                    if (filter_token === 'location') {
                        await updateLocation();
                    }

                    if (filter_token === 'modes') {
                        await updateModes();
                    }

                    if (filter_token === 'networks') {
                        await updateNetworks();
                    }

                    if (filter_token.startsWith('review')) {
                        await updateReviews();
                    }

                    if (filter_token === 'verifications') {
                        await updateVerifications();
                    }

                    if (filter_token === 'genders') {
                        await updateGenders();
                    }
                }
            }

            if (delKeysSet.size) {
                hasPipelineRem = true;

                for (let key of delKeysSet) {
                    pipelineRem.sRem(key, person.person_token);
                }
            }

            if (keysDelSorted.size) {
                hasPipelineRem = true;

                for (let key of keysDelSorted) {
                    pipelineRem.zRem(key, person.person_token);
                }
            }

            if (addKeysSet.size) {
                hasPipelineAdd = true;

                for (let key of addKeysSet) {
                    pipelineAdd.sAdd(key, person.person_token);
                }
            }

            if (keysAddSorted.size) {
                hasPipelineAdd = true;

                for (let data of keysAddSorted) {
                    pipelineAdd.zAdd(data.key, {
                        value: person.person_token,
                        score: data.score,
                    });
                }
            }
        }

        if(hasPipelineRem) {
            try {
                await cacheService.execPipeline(pipelineRem);
            } catch(e) {
                console.error(e);
            }
        }

        if(hasPipelineAdd) {
            try {
                await cacheService.execPipeline(pipelineAdd);
            } catch(e) {
                console.error(e);
            }
        }

        resolve();
    });
}

function getInterestSections() {
    return Object.values(filterMappings).filter(
        (section) => section.is_interests && !section.is_sub,
    );
}

function getSchoolsWorkSections() {
    return Object.values(filterMappings).filter(
        (section) => section.is_school_work && !section.is_sub,
    );
}

function getPersonalSections() {
    return Object.values(filterMappings).filter(
        (section) => section.is_personal && !section.is_sub,
    );
}

module.exports = {
    filters: null,
    filterMappings,
    getFilters,
    getPersonFilters,
    getPersonFilterForKey,
    getInterestSections,
    getSchoolsWorkSections,
    getPersonalSections,
    updateGridSets,
    batchUpdateGridSets
};
