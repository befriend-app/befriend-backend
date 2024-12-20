const cacheService = require('./cache');
const dbService = require('./db');

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
    reviews_unrated: {
        token: 'reviews_unrated',
        name: 'Unrated',
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

module.exports = {
    filters: null,
    filterMappings,
    getFilters,
    getPersonFilters,
};
