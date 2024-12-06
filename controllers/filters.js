const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { getPerson } = require('../services/persons');
const { timeNow } = require('../services/shared');
const { getGenders } = require('../services/me');
const { saveAvailabilityData } = require('../services/availability');
const { filterMappings, getFilters, getPersonFilters, getModes } = require('../services/filters');

function createFilterEntry(filter_id, props = {}) {
    const now = timeNow();

    // If props contain a reference to an existing filter, inherit its states
    const existingFilter = structuredClone(props.existingFilter);
    if (existingFilter) {
        delete props.existingFilter;

        return {
            filter_id,
            is_send: existingFilter.is_send,
            is_receive: existingFilter.is_receive,
            is_active: existingFilter.is_active,
            is_negative: false,
            created: now,
            updated: now,
            ...props
        };
    }

    // default
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

            if (existingFilter) {
                // Update all filter entries for this filter
                await conn('persons_filters')
                    .where('person_id', person.id)
                    .where('filter_id', filter.id)
                    .update({
                        is_active: active,
                        updated: now
                    });

                // Update cache
                existingFilter.is_active = active;
                existingFilter.updated = now;

                if(existingFilter.items) {
                    for(let k in existingFilter.items) {
                        existingFilter.items[k].is_active = active;
                    }
                }
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_active: active
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters[filter_token] = mapping.multi ? {
                    ...filterEntry,
                    id,
                    items: {}
                } : {
                    ...filterEntry,
                    id
                };
            }

            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json("Updated");
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

            if (existingFilter) {
                let updateData = {
                    updated: now
                };
                updateData[type === 'send' ? 'is_send' : 'is_receive'] = enabled;

                await conn('persons_filters')
                    .where('person_id', person.id)
                    .where('filter_id', filter.id)
                    .update(updateData);

                // Update cache
                existingFilter[type === 'send' ? 'is_send' : 'is_receive'] = enabled;
                existingFilter.updated = now;

                if(existingFilter.items) {
                    for(let k in existingFilter.items) {
                        existingFilter.items[k][type === 'send' ? 'is_send' : 'is_receive'] = enabled;
                    }
                }
            } else {
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_send: type === 'send' ? enabled : true,
                    is_receive: type === 'receive' ? enabled : true
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters[filter_token] = mapping.multi ? {
                    ...filterEntry,
                    id,
                    items: {}
                } : {
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
                message: 'Error updating filter send/receive state'
            }, 400);
        }

        resolve();
    });
}

function putAvailability(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, availability } = req.body;

            // Validate required fields
            if (!availability || typeof availability !== 'object') {
                res.json({
                    message: 'Invalid availability data',
                    success: false
                }, 400);
                return resolve();
            }

            const person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found',
                    success: false
                }, 400);
                return resolve();
            }

            const result = await saveAvailabilityData(person, availability);

            res.json(result);
        } catch (error) {
            console.error('Error in putAvailability:', error);
            res.json({
                message: error.message || 'Error updating availability',
                success: false
            }, 400);
        }

        resolve();
    });
}

function putModes(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, mode_token, active } = req.body;

            if (!mode_token || typeof active !== 'boolean') {
                res.json({
                    message: 'Mode token and active state required',
                }, 400);
                return resolve();
            }

            let mapping = filterMappings.modes;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json({
                    message: 'Modes filter not found'
                }, 400);
                return resolve();
            }

            const person = await getPerson(person_token);

            if (!person) {
                res.json({
                    message: 'Person not found',
                    success: false
                }, 400);
                return resolve();
            }

            let modes = await getModes();

            const mode = modes?.byToken?.[mode_token];
            const soloMode = modes?.byToken?.['solo'];

            if (!mode) {
                res.json({
                    message: 'Invalid mode token'
                }, 400);
                return resolve();
            }

            let conn = await dbService.conn();
            let now = timeNow();

            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);

            // Get or initialize existing filter
            let existingFilter = person_filters[filter.token];

            if (!existingFilter) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id
                });

                const [id] = await conn('persons_filters')
                    .insert(baseEntry);

                existingFilter = {
                    ...baseEntry,
                    id,
                    items: {}
                };
                person_filters[filter.token] = existingFilter;
            } else if (!existingFilter.items) {
                existingFilter.items = {};
            }

            const filterItems = existingFilter.items;
            const existingItem = Object.values(filterItems)
                .find(item => item[mapping.column] === mode.id);
            const existingSolo = Object.values(filterItems)
                .find(item => item[mapping.column] === soloMode?.id);

            // If selecting a non-solo mode and solo isn't present, add it first
            if (active && mode_token !== 'solo' && !existingSolo && soloMode) {
                let soloEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    [mapping.column]: soloMode.id,
                    is_negative: false,
                    existingFilter
                });

                const [soloId] = await conn('persons_filters')
                    .insert(soloEntry);

                soloEntry.mode_token = 'solo';
                filterItems[soloId] = {
                    ...soloEntry,
                    id: soloId
                };
            }

            if (existingItem) {
                if (active) {
                    await conn('persons_filters')
                        .where('id', existingItem.id)
                        .update({
                            is_negative: false,
                            updated: now,
                            deleted: null
                        });

                    // Update cache
                    existingItem.is_negative = false;
                    existingItem.updated = now;
                    delete existingItem.deleted;
                } else {
                    // Ensure we have more than one active mode before allowing deactivation
                    const activeItems = Object.values(filterItems)
                        .filter(item => !item.is_negative && !item.deleted);

                    if (activeItems.length <= 1) {
                        res.json({
                            message: 'Cannot deactivate last active mode'
                        }, 400);
                        return resolve();
                    }

                    await conn('persons_filters')
                        .where('id', existingItem.id)
                        .update({
                            is_negative: true,
                            updated: now
                        });

                    existingItem.is_negative = true;
                    existingItem.updated = now;
                }
            } else if (active) {
                // Create new mode selection with inherited states
                let filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    [mapping.column]: mode.id,
                    is_negative: false,
                    existingFilter // Pass parent filter to inherit states
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                filterEntry.mode_token = mode_token;
                filterItems[id] = {
                    ...filterEntry,
                    id
                };
            }

            // Update cache
            await cacheService.setCache(person_filter_cache_key, person_filters);

            res.json({
                success: true
            });
        } catch (error) {
            console.error('Modes error:', error);

            res.json({
                message: error.message || 'Error updating modes',
                success: false
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

            if (!gender_token || typeof active !== 'boolean') {
                res.json({
                    message: 'Gender token and active state required',
                }, 400);
                return resolve();
            }

            let mapping = filterMappings.genders;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json({
                    message: 'Gender filter not found'
                }, 400);
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json({
                    message: 'Person not found'
                }, 400);
                return resolve();
            }

            let genders = await getGenders(true);
            let anyOption = genders.find(item => item.token === 'any');

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let person_filters = await getPersonFilters(person);
            let now = timeNow();

            let existingFilter = person_filters[filter.token];

            // Initialize filter structure if it doesn't exist
            if (!existingFilter) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id
                });

                // Create base filter entry in database
                const [id] = await conn('persons_filters')
                    .insert(baseEntry);

                existingFilter = {
                    ...baseEntry,
                    id,
                    items: {}
                };
                person_filters[filter.token] = existingFilter;
            } else if (!existingFilter.items) {
                existingFilter.items = {};
            }

            const filterItems = existingFilter.items;

            // Get existing 'any' selection if it exists
            const existingAny = Object.values(filterItems)
                .find(item => item[mapping.column] === anyOption.id);

            // Handle 'any' gender selection
            if (gender_token === 'any' && active) {
                // Mark all non-any items as negative
                await conn('persons_filters')
                    .whereIn('id', Object.keys(person_filters[filter.token].items))
                    .update({
                        is_negative: true,
                        updated: now
                    });

                for (let id in person_filters[filter.token].items) {
                    person_filters[filter.token].items[id].is_negative = true;
                    person_filters[filter.token].items[id].updated = now;
                }

                // Create or update 'any' entry
                if (existingAny) {
                    await conn('persons_filters')
                        .where('id', existingAny.id)
                        .update({
                            is_negative: false,
                            updated: now
                        });

                    existingAny.is_negative = false;
                    existingAny.updated = now;
                } else {
                    const anyEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: anyOption.id,
                        is_negative: false,
                        existingFilter
                    });

                    const [id] = await conn('persons_filters')
                        .insert(anyEntry);

                    person_filters[filter.token].items[id] = {
                        ...anyEntry,
                        id
                    };
                }
            }
            // Handle specific gender selection
            else {
                // Find matching gender from data
                let gender = genders.find(g => g.token === gender_token);

                if (!gender) {
                    res.json({
                        message: 'Invalid gender token'
                    }, 400);
                    return resolve();
                }

                // Mark 'any' selection as negative if it exists
                if (existingAny) {
                    await conn('persons_filters')
                        .where('id', existingAny.id)
                        .update({
                            is_negative: true,
                            updated: now
                        });

                    existingAny.is_negative = true;
                    existingAny.updated = now;
                }

                // Check for existing selection
                const existingItem = Object.values(person_filters[filter.token].items)
                    .find(item => item[mapping.column] === gender.id);

                if (existingItem) {
                    // Update existing entry
                    await conn('persons_filters')
                        .where('id', existingItem.id)
                        .update({
                            is_negative: !active,
                            updated: now
                        });

                    existingItem.is_negative = !active;
                    existingItem.updated = now;
                } else {
                    // Create new gender selection
                    const filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: gender.id,
                        is_negative: !active
                    });

                    const [id] = await conn('persons_filters')
                        .insert(filterEntry);

                    person_filters[filter.token].items[id] = {
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
                message: 'Error updating gender filter'
            }, 400);
        }

        resolve();
    });
}

function putDistance(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, distance } = req.body;

            // Validate inputs
            if (typeof distance !== 'number' || distance < 1 || distance > 60) {
                res.json({
                    message: 'Valid distance required (1-60 miles)'
                }, 400);
                return resolve();
            }

            // Get filter data
            let filters = await getFilters();
            let filter = filters.byToken['distance'];

            if (!filter) {
                res.json({
                    message: 'Distance filter not found'
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
            let existingFilter = person_filters['distance'];

            if (existingFilter) {
                // Update existing filter
                await conn('persons_filters')
                    .where('id', existingFilter.id)
                    .update({
                        filter_value: distance.toString(),
                        updated: now
                    });

                existingFilter.filter_value = distance.toString();
                existingFilter.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value: distance.toString()
                });

                const [id] = await conn('persons_filters')
                    .insert(filterEntry);

                person_filters['distance'] = {
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
                message: 'Error updating distance'
            }, 400);
        }

        resolve();
    });
}

module.exports = {
    putActive,
    putSendReceive,
    putAvailability,
    putModes,
    putReviewRating,
    putAge,
    putGender,
    putDistance,
};