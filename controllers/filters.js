const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { getPerson } = require('../services/persons');
const { timeNow } = require('../services/shared');

const filterMappings = {
    networks: {
        token: 'networks',
        name: 'Networks',
        column: 'network_id',
        table: 'networks',
        multi: true
    },
    activity_types: {
        token: 'activity_types',
        name: 'Activity Types',
        column: 'activity_type_id',
        table: 'activity_types',
        multi: true
    },
    modes: {
        token: 'modes',
        name: 'Modes',
        multi: true
    },
    days_of_week: {
        token: 'days_of_week',
        name: 'Day of Week',
        multi: true
    },
    times_of_day: {
        token: 'times_of_day',
        name: 'Time of Day',
        multi: true
    },
    distance: {
        token: 'distance',
        name: 'Distance',
        single: true
    },
    reviews_safety: {
        token: 'reviews_safety',
        name: 'Safety',
        single: true
    },
    reviews_trust: {
        token: 'reviews_trust',
        name: 'Trust',
        single: true
    },
    reviews_timeliness: {
        token: 'reviews_timeliness',
        name: 'Timeliness',
        single: true
    },
    reviews_friendliness: {
        token: 'reviews_friendliness',
        name: 'Friendliness',
        single: true
    },
    reviews_fun: {
        token: 'reviews_fun',
        name: 'Fun',
        single: true
    },
    reviews_unrated: {
        token: 'reviews_unrated',
        name: 'Unrated',
        single: true
    },
    verification_linkedin: {
        token: 'verification_linkedin',
        name: 'LinkedIn',
        single: true
    },
    verification_dl: {
        token: 'verification_dl',
        name: "Driver's License",
        single: true
    },
    verification_cc: {
        token: 'verification_cc',
        name: 'Credit Card',
        single: true
    },
    verification_video: {
        token: 'verification_video',
        name: 'Video',
        single: true
    },
    verification_in_person: {
        token: 'verification_in_person',
        name: 'In-Person',
        single: true
    },
    verification_mailer: {
        token: 'verification_mailer',
        name: 'Mail',
        single: true
    },
    ages: {
        token: 'ages',
        name: 'Age',
        single: true
    },
    genders: {
        token: 'genders',
        name: 'Gender',
        column: 'gender_id',
        table: 'genders',
        multi: true
    },
    life_stages: {
        token: 'life_stages',
        name: 'Life Stage',
        column: 'life_stage_id',
        table: 'life_stages',
        multi: true
    },
    relationship: {
        token: 'relationship',
        name: 'Relationship Status',
        column: 'relationship_status_id',
        table: 'relationship_status',
        multi: true
    },
    schools: {
        token: 'schools',
        name: 'Schools',
        column: 'school_id',
        table: 'schools',
        multi: true
    },
    work_industries: {
        token: 'work_industries',
        name: 'Industry',
        column: 'work_industry_id',
        table: 'work_industries',
        multi: true
    },
    work_roles: {
        token: 'work_roles',
        name: 'Role',
        column: 'work_role_id',
        table: 'work_roles',
        multi: true
    },
    sports_play: {
        token: 'sports_play',
        name: 'Play',
        column: 'sport_play_id',
        table: 'sports',
        multi: true
    },
    sports_league: {
        token: 'sports_league',
        name: 'Leagues',
        column: 'sport_league_id',
        table: 'sports_leagues',
        multi: true
    },
    sport_team: {
        token: 'sport_team',
        name: 'Teams',
        column: 'sport_team_id',
        table: 'sports_teams',
        multi: true
    },
    movie_genres: {
        token: 'movie_genres',
        name: 'Movie Genres',
        column: 'movie_genre_id',
        table: 'movie_genres',
        multi: true
    },
    movies: {
        token: 'movies',
        name: 'Movies',
        column: 'movie_id',
        table: 'movies',
        multi: true
    },
    tv_show_genres: {
        token: 'tv_show_genres',
        name: 'TV Show Genres',
        column: 'tv_show_genre_id',
        table: 'tv_genres',
        multi: true
    },
    tv_shows: {
        token: 'tv_shows',
        name: 'TV Shows',
        column: 'tv_show_id',
        table: 'tv_shows',
        multi: true
    },
    music_artists: {
        token: 'music_artists',
        name: 'Music Artists',
        column: 'music_artist_id',
        table: 'music_artists',
        multi: true
    },
    music_genres: {
        token: 'music_genres',
        name: 'Music Genres',
        column: 'music_genre_id',
        table: 'music_genres',
        multi: true
    },
    instruments: {
        token: 'instruments',
        name: 'Instruments',
        column: 'instrument_id',
        table: 'instruments',
        multi: true
    },
    languages: {
        token: 'languages',
        name: 'Languages',
        column: 'language_id',
        table: 'languages',
        multi: true
    },
    drinking: {
        token: 'drinking',
        name: 'Drinking',
        column: 'drinking_id',
        table: 'drinking',
        single: true
    },
    smoking: {
        token: 'smoking',
        name: 'Smoking',
        column: 'smoking_id',
        table: 'smoking',
        single: true
    },
    politics: {
        token: 'politics',
        name: 'Politics',
        column: 'politics_id',
        table: 'politics',
        single: true
    },
    religion: {
        token: 'religion',
        name: 'Religion',
        column: 'religion_id',
        table: 'religions',
        multi: true
    }
};

function createFilterEntry(filter_id, props = {}) {
    const now = timeNow();

    return {
        filter_id,
        is_send: true,
        is_receive: true,
        is_negative: false,
        is_active: true,
        created: now,
        updated: now,
        ...props
    };
}

function getFilters() {
    return new Promise(async (resolve, reject) => {
        if(module.exports.filters) {
            return resolve(module.exports.filters);
        }

        let cache_key = cacheService.keys.filters;

        try {
            let cache_data = await cacheService.getObj(cache_key);

            if(cache_data) {
                module.exports.filters = cache_data;
                return resolve(cache_data);
            }

            let conn = await dbService.conn();

            let filters = await conn('filters')
                .whereNull('deleted');

            let filters_dict = filters.reduce((acc, filter) => {
                acc.byId[filter.id] = filter;
                acc.byToken[filter.token] = filter;
                return acc;
            }, {byId: {}, byToken: {}});

            module.exports.filters = filters_dict;

            await cacheService.setCache(cache_key, filters_dict)

            resolve(filters_dict);
        } catch(e) {
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

             if(0 && person_filters) {
                 return resolve(person_filters);
             }

             let filters = await module.exports.getFilters();

             let conn = await dbService.conn();

             let qry = await conn('persons_filters')
                 .where('person_id', person.id);

             person_filters = {};

            for (let row of qry) {
                let filter = filters.byId[row.filter_id];
                if (!filter) {
                    console.error("Filter not found");
                    continue;
                }

                const mapping = filterMappings[filter.token];
                if (!mapping) {
                    console.error("Filter mapping not found");
                    continue;
                }

                // Initialize filter group if it doesn't exist
                if (!person_filters[filter.token]) {
                    person_filters[filter.token] = mapping.multi ? {} : null;
                }

                // Create base filter entry
                let filterEntry = createFilterEntry(row.filter_id, {
                    id: row.id,
                    person_id: row.person_id,
                    is_send: row.is_send,
                    is_receive: row.is_receive,
                    is_negative: row.is_negative,
                    is_active: row.is_active,
                    created: row.created,
                    updated: row.updated
                });

                // Add filter values if present
                if(row.secondary_level !== null) {
                    filterEntry.secondary_level = row.filter_value;
                }
                if (row.filter_value !== null) {
                    filterEntry.filter_value = row.filter_value;
                }
                if (row.filter_value_min !== null) {
                    filterEntry.filter_value_min = row.filter_value_min;
                }
                if (row.filter_value_max !== null) {
                    filterEntry.filter_value_max = row.filter_value_max;
                }

                if (mapping.column && row[mapping.column]) {
                    filterEntry[mapping.token] = row[mapping.column];
                }

                // Store based on single/multi setting
                if (mapping.multi) {
                    person_filters[filter.token][row.id] = filterEntry;
                } else {
                    person_filters[filter.token] = filterEntry;
                }
            }

            await cacheService.setCache(cache_key, person_filters);

            resolve(person_filters);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function putActive(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let { person_token, filter_token, active } = req.body;

            if(typeof filter_token !== 'string' || typeof active !== 'boolean') {
                res.json({
                    message: 'Filter and state required',
                }, 400);

                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if(!filter || !mapping) {
                res.json({
                    message: 'Invalid filter',
                }, 400);
                return resolve();
            }

            let person = await getPerson(person_token);

            if(!person) {
                res.json({
                    message: 'Person not found'
                }, 400);

                return resolve();
            }

            let conn = await dbService.conn();

            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);

            let now = timeNow();

            let existingFilter = person_filters[filter_token];

            if(mapping.multi && existingFilter) {
                existingFilter = Object.values(existingFilter)[0];
            }

            if(existingFilter && Object.keys(existingFilter).length) {
                await conn('persons_filters')
                    .where('id', existingFilter.id)
                    .update({
                        is_active: active,
                        updated: now
                    });

                if (mapping.multi) {
                    person_filters[filter_token][existingFilter.id].is_active = active;
                    person_filters[filter_token][existingFilter.id].updated = now;
                } else {
                    person_filters[filter_token].is_active = active;
                    person_filters[filter_token].updated = now;
                }
            } else {
                // Create new filter
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_active: active
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                // Initialize in cache
                if (!person_filters[filter_token] && mapping.multi) {
                    person_filters[filter_token] = {};
                }

                // Store based on single/multi setting
                if (mapping.multi) {
                    person_filters[filter_token][id] = {
                        ...filterEntry,
                        id
                    };
                } else {
                    person_filters[filter_token] = {
                        ...filterEntry,
                        id
                    };
                }
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);
        } catch(e) {
            console.error(e);
            res.json({
                message: 'Error updating filter'
            }, 400);
        }

        resolve();
    });
}

function putSendReceive(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let { person_token, filter_token, type, enabled } = req.body;

            // Validate required fields
            if (!filter_token || !type || typeof enabled !== 'boolean') {
                res.json({
                    message: 'Filter token, type and enabled state required',
                }, 400);
                return resolve();
            }

            // Validate type
            if (!['send', 'receive'].includes(type)) {
                res.json({
                    message: 'Invalid type - must be send or receive',
                }, 400);
                return resolve();
            }

            // Get filter and mapping data
            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if (!filter || !mapping) {
                res.json({
                    message: 'Invalid filter',
                }, 400);
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found'
                }, 400);
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);
            let now = timeNow();

            let existingFilter = person_filters[filter_token];
            if (mapping.multi && existingFilter) {
                existingFilter = Object.values(existingFilter)[0];
            }

            if (existingFilter && Object.keys(existingFilter).length) {
                // Update existing filter
                let updateData = {
                    updated: now
                };

                if (type === 'send') {
                    updateData.is_send = enabled;
                } else {
                    updateData.is_receive = enabled;
                }

                await conn('persons_filters')
                    .where('id', existingFilter.id)
                    .update(updateData);

                // Update cache
                if (mapping.multi) {
                    if (type === 'send') {
                        person_filters[filter_token][existingFilter.id].is_send = enabled;
                    } else {
                        person_filters[filter_token][existingFilter.id].is_receive = enabled;
                    }
                    person_filters[filter_token][existingFilter.id].updated = now;
                } else {
                    if (type === 'send') {
                        person_filters[filter_token].is_send = enabled;
                    } else {
                        person_filters[filter_token].is_receive = enabled;
                    }
                    person_filters[filter_token].updated = now;
                }
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_send: type === 'send' ? enabled : true,
                    is_receive: type === 'receive' ? enabled : true
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                // Initialize in cache
                if (!person_filters[filter_token] && mapping.multi) {
                    person_filters[filter_token] = {};
                }

                // Store in cache based on single/multi setting
                if (mapping.multi) {
                    person_filters[filter_token][id] = {
                        ...filterEntry,
                        id
                    };
                } else {
                    person_filters[filter_token] = {
                        ...filterEntry,
                        id
                    };
                }
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json({
                success: true
            });

        } catch (e) {
            console.error(e);
            res.json({
                message: 'Error updating filter send/receive state'
            }, 400);
        }

        resolve();
    });
}

function putReviewRating(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, filter_token, rating } = req.body;

            // Validate inputs
            if (!filter_token || typeof rating !== 'number' || rating < 0 || rating > 5) {
                res.json({
                    message: 'Valid filter token and rating (0-5) required'
                }, 400);
                return resolve();
            }

            // Get filter and mapping data
            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if (!filter || !mapping) {
                res.json({
                    message: 'Invalid filter'
                }, 400);
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found'
                }, 400);
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);
            let now = timeNow();

            // Get or create filter entry
            let existingFilter = person_filters[filter_token];

            if (existingFilter) {
                // Update existing filter
                await conn('persons_filters')
                    .where('id', existingFilter.id)
                    .update({
                        filter_value: rating.toFixed(1),
                        updated: now
                    });

                existingFilter.filter_value = rating.toFixed(1);
                existingFilter.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value: rating.toFixed(1)
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters[filter_token] = {
                    ...filterEntry,
                    id
                };
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json({
                success: true
            });
        } catch (e) {
            console.error(e);
            res.json({
                message: 'Error updating review rating'
            }, 400);
        }

        resolve();
    });
}

function putAge(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, min_age, max_age } = req.body;

            // Validate inputs
            if (typeof min_age !== 'number' || typeof max_age !== 'number' ||
                min_age < 18 || max_age > 130 || min_age > max_age) {
                res.json({
                    message: 'Valid age range required (18-130)'
                }, 400);
                return resolve();
            }

            // Get filter data
            let filters = await getFilters();
            let filter = filters.byToken['ages'];

            if (!filter) {
                res.json({
                    message: 'Age filter not found'
                }, 400);
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found'
                }, 400);
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);
            let now = timeNow();

            // Get or create filter entry
            let existingFilter = person_filters['ages'];

            if (existingFilter) {
                // Update existing filter
                await conn('persons_filters')
                    .where('id', existingFilter.id)
                    .update({
                        filter_value_min: min_age.toString(),
                        filter_value_max: max_age.toString(),
                        updated: now
                    });

                existingFilter.filter_value_min = min_age.toString();
                existingFilter.filter_value_max = max_age.toString();
                existingFilter.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value_min: min_age.toString(),
                    filter_value_max: max_age.toString()
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters['ages'] = {
                    ...filterEntry,
                    id
                };
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json({
                success: true
            });
        } catch (e) {
            console.error(e);
            res.json({
                message: 'Error updating age range'
            }, 400);
        }

        resolve();
    });
}

function putGender(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, gender_token, active } = req.body;

            // Validate inputs
            if (!gender_token || typeof active !== 'boolean') {
                res.json({
                    message: 'Gender token and active state required',
                }, 400);
                return resolve();
            }

            // Get filter data
            let filters = await getFilters();
            let filter = filters.byToken['genders'];

            if (!filter) {
                res.json({
                    message: 'Gender filter not found'
                }, 400);
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found'
                }, 400);
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);

            // Handle 'any' gender selection
            if (gender_token === 'any' && active) {
                // Clear all existing gender selections
                if (person_filters['genders']) {
                    await conn('persons_filters')
                        .where('filter_id', filter.id)
                        .where('person_id', person.id)
                        .delete();

                    delete person_filters['genders'];
                }

                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters['genders'] = {
                    [id]: {
                        ...filterEntry,
                        id
                    }
                };
            }
            // Handle specific gender selection
            else {
                // Find matching gender from data
                let gender = befriend.me.data.genders?.find(g => g.token === gender_token);

                if (!gender && gender_token !== 'any') {
                    res.json({
                        message: 'Invalid gender token'
                    }, 400);
                    return resolve();
                }

                // Remove 'any' selection if it exists
                if (person_filters['genders']) {
                    const anyFilter = Object.values(person_filters['genders'])
                        .find(f => f.secondary_level === 'any');

                    if (anyFilter) {
                        await conn('persons_filters')
                            .where('id', anyFilter.id)
                            .delete();

                        delete person_filters['genders'];
                    }
                }

                if (active) {
                    // Add new gender selection
                    const filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [filterMappings.genders.column]: gender.id,
                    });

                    const [id] = await conn('persons_filters')
                        .insert(filterEntry);

                    if (!person_filters['genders']) {
                        person_filters['genders'] = {};
                    }

                    person_filters['genders'][id] = {
                        ...filterEntry,
                        id
                    };
                } else {
                    // Remove gender selection
                    if (person_filters['genders']) {
                        const existingFilter = Object.values(person_filters['genders'])
                            .find(f => f[filterMappings.genders.column] === gender.id);

                        if (existingFilter) {
                            await conn('persons_filters')
                                .where('id', existingFilter.id)
                                .delete();

                            delete person_filters['genders'][existingFilter.id];

                            if (Object.keys(person_filters['genders']).length === 0) {
                                delete person_filters['genders'];
                            }
                        }
                    }
                }
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json({
                success: true
            });

        } catch (e) {
            console.error(e);
            res.json({
                message: 'Error updating gender filter'
            }, 400);
        }

        resolve();
    });
}

module.exports = {
    filterMappings,
    filters: null,
    getFilters,
    getPersonFilters,
    putActive,
    putSendReceive,
    putReviewRating,
    putAge,
    putGender
};