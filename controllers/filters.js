const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { getPerson, minAge, maxAge } = require('../services/persons');
const { timeNow, generateToken } = require('../services/shared');
const {
    getGenders,
    getInstruments,
    allInstruments,
    getWork,
    getMusic,
    getSports,
    getMovies,
    getTvShows,
    getSchools,
} = require('../services/me');
const { saveAvailabilityData } = require('../services/availability');
const {
    filterMappings,
    getFilters,
    getPersonFilterForKey,
    getPersonFilters,
    updateGridSets,
} = require('../services/filters');
const { getActivityTypesMapping } = require('../services/activities');
const { getLifeStages } = require('../services/life_stages');
const { getRelationshipStatus } = require('../services/relationships');
const { getLanguages, getLanguagesCountry } = require('../services/languages');
const { getPolitics } = require('../services/politics');
const { getDrinking } = require('../services/drinking');
const { getSmoking } = require('../services/smoking');
const { getReligions } = require('../services/religion');

let sectionsData = require('../services/sections_data');
const { getNetworksForFilters } = require('../services/network');
const { getModes } = require('../services/modes');
const matchingService = require('../services/matching');

function createFilterEntry(filter_id, props = {}) {
    const now = timeNow();

    // If props contain a reference to an existing filter, inherit its states
    const filterData = props.filterData ? structuredClone(props.filterData) : null;

    if (filterData) {
        delete props.filterData;

        return {
            filter_id,
            token: generateToken(10),
            is_send: filterData.is_send,
            is_receive: filterData.is_receive,
            is_active: filterData.is_active,
            is_negative: false,
            created: now,
            updated: now,
            ...props,
        };
    }

    // default
    return {
        filter_id,
        token: generateToken(10),
        is_send: true,
        is_receive: true,
        is_negative: false,
        is_active: true,
        created: now,
        updated: now,
        ...props,
    };
}

function getFiltersOptions(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let organized = {
                networks: null,
                movies: null,
                tv_shows: null,
                sports: null,
                music: null,
                instruments: null,
                schools: null,
                work: null,
                life_stages: null,
                relationships: null,
                languages: null,
                politics: null,
                religion: null,
                drinking: null,
                smoking: null,
            };

            let person = await getPerson(req.query.person_token || req.body.person_token);

            organized.networks = await getNetworksForFilters();

            organized.movies = await getMovies();
            organized.tv_shows = await getTvShows();
            organized.sports = await getSports({
                country_code: person?.country_code,
            });
            organized.music = await getMusic(person?.country_code);
            organized.instruments = await getInstruments();
            organized.schools = await getSchools();
            organized.work = await getWork();
            organized.life_stages = await getLifeStages();
            organized.relationships = await getRelationshipStatus();
            organized.languages = await getLanguagesCountry(person?.country_code);
            organized.politics = await getPolitics();
            organized.religion = await getReligions();
            organized.drinking = await getDrinking();
            organized.smoking = await getSmoking();

            res.json(organized);
        } catch (e) {
            console.error(e);
            res.json('Error getting filter options', 400);
        }

        resolve();
    });
}

function getMatches(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let person = await getPerson(req.query.person_token);

            let matches = await matchingService.getMatches(person, {
                counts_only: true,
            });

            res.json(matches);
        } catch (e) {
            console.error(e);

            res.json(
                {
                    message: 'Error getting matches',
                },
                400,
            );
        }

        resolve();
    });
}

function handleFilterUpdate(req, res, filterType) {
    function getFilterTypeStr() {
        if (filterType.toLowerCase().startsWith('relationship')) {
            return 'relationship_status';
        }

        if (filterType.toLowerCase().startsWith('politics')) {
            return filterType;
        }

        return filterType.endsWith('s')
            ? filterType.substring(0, filterType.length - 1)
            : filterType;
    }

    let filterFunctionMap = {
        life_stages: getLifeStages,
        relationships: getRelationshipStatus,
        languages: getLanguages,
        religion: getReligions,
        politics: getPolitics,
        drinking: getDrinking,
        smoking: getSmoking,
    };

    let filterTypeStr = getFilterTypeStr();

    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const tokenField = `${filterTypeStr}_token`;
            const { [tokenField]: token, active, person_token } = req.body;

            // Input validation
            if (!token || typeof active !== 'boolean') {
                res.json(
                    {
                        message: `${filterType} token and active state required`,
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            const person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            // Get filter mapping and data
            const mapping = filterMappings[filterType];
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];
            let function_call = filterFunctionMap[filterType];

            if (!mapping || !filter || !function_call) {
                res.json(
                    {
                        message: 'Invalid filter type',
                    },
                    400,
                );
                return resolve();
            }

            let options = await function_call();
            let option = options.find((item) => item.token === token);

            const conn = await dbService.conn();
            const cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            const now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters
                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_negative: false,
                            updated: now,
                            deleted: true,
                        });

                // Update cache
                filterData.is_any = true;

                for (let id in filterData.items) {
                    filterData.items[id].is_negative = false;
                    filterData.items[id].updated = now;
                    filterData.items[id].deleted = now;
                }
            } else {
                filterData.is_any = false;

                // Handle specific selection

                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    // Update existing item
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('id', existingItem.id)
                        .update({
                            is_negative: !active,
                            updated: now,
                            deleted: null,
                        });

                    existingItem.is_negative = !active;
                    existingItem.updated = now;
                    existingItem.deleted = null;
                } else {
                    // Create new relationship status selection
                    const filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_negative: !active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            // Update cache and return
            await cacheService.hSet(cache_key, filter.token, filterData);

            await updateGridSets(
                person,
                {
                    [filter.token]: filterData,
                },
                filterType,
            );

            res.json({
                id,
                data: filterData,
                success: true,
            });
        } catch (error) {
            console.error(`Error in ${filterType} filter update:`, error);

            res.json(
                {
                    message: error.message || `Error updating ${filterType} filter`,
                },
                500,
            );
        }

        resolve();
    });
}

function putActive(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let { person_token, filter_token, active } = req.body;

            if (typeof filter_token !== 'string' || typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Filter and state required',
                    },
                    400,
                );

                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if (!filter || !mapping) {
                res.json(
                    {
                        message: 'Invalid filter',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();

            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter_token);
            let now = timeNow();

            if (filterData) {
                //custom for availability
                if(filter_token === 'availability') {
                    let exists_qry = await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .first();

                    if(!exists_qry) {
                        let [id] = await conn('persons_filters')
                            .insert({
                                person_id: person.id,
                                filter_id: filter.id,
                                is_active: active,
                                created: now,
                                updated: now
                            });

                        filterData.id = id;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('filter_id', filter.id)
                            .update({
                                is_active: active,
                                updated: now,
                            });
                    }
                } else {
                    //update all entries for this filter
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: active,
                            updated: now,
                        });
                }

                // Update cache
                filterData.is_active = active;
                filterData.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_active: active
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterData = mapping.multi
                    ? {
                          ...filterEntry,
                          id,
                          items: {},
                      }
                    : {
                          ...filterEntry,
                          id,
                      };
            }

            await cacheService.hSet(person_filter_cache_key, filter_token, filterData);

            await updateGridSets(
                person,
                {
                    [filter_token]: filterData,
                },
                filter_token,
            );

            res.json('Updated');
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putImportance(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let { person_token, section, filter_item_id, importance } = req.body;

            if (
                typeof filter_item_id !== 'number' ||
                typeof section !== 'string' ||
                typeof importance !== 'number' ||
                importance < 0 ||
                importance > 10
            ) {
                res.json(
                    {
                        message: 'Filter and state required',
                    },
                    400,
                );

                return resolve();
            }

            let person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();

            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, section);
            let now = timeNow();

            if (!filterData?.items?.[filter_item_id]) {
                res.json(
                    {
                        message: 'Invalid filter item',
                    },
                    400,
                );

                return resolve();
            }

            await conn('persons_filters')
                .where('person_id', person.id)
                .where('id', filter_item_id)
                .update({
                    importance: importance,
                    updated: now,
                });

            filterData.items[filter_item_id].importance = importance;

            await cacheService.hSet(person_filter_cache_key, section, filterData);

            await updateGridSets(
                person,
                {
                    [section]: filterData,
                },
                section,
            );

            res.json('Updated');
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
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
                res.json(
                    {
                        message: 'Filter token, type and enabled state required',
                    },
                    400,
                );
                return resolve();
            }

            // Validate type
            if (!['send', 'receive'].includes(type)) {
                res.json(
                    {
                        message: 'Invalid type - must be send or receive',
                    },
                    400,
                );
                return resolve();
            }

            // Get filter and mapping data
            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if (!filter || !mapping) {
                res.json(
                    {
                        message: 'Invalid filter',
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter_token);
            let now = timeNow();

            if (filterData) {
                let updateData = {
                    updated: now,
                };
                updateData[type === 'send' ? 'is_send' : 'is_receive'] = enabled;

                await conn('persons_filters')
                    .where('person_id', person.id)
                    .where('filter_id', filter.id)
                    .update(updateData);

                // Update cache
                filterData[type === 'send' ? 'is_send' : 'is_receive'] = enabled;
                filterData.updated = now;

                if (filterData.items) {
                    for (let k in filterData.items) {
                        filterData.items[k][type === 'send' ? 'is_send' : 'is_receive'] = enabled;
                    }
                }
            } else {
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    is_send: type === 'send' ? enabled : true,
                    is_receive: type === 'receive' ? enabled : true,
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterData = mapping.multi
                    ? {
                          ...filterEntry,
                          id,
                          items: {},
                      }
                    : {
                          ...filterEntry,
                          id,
                      };
            }

            await cacheService.hSet(person_filter_cache_key, filter_token, filterData);

            await updateGridSets(
                person,
                {
                    [filter_token]: filterData,
                },
                filter_token,
            );

            res.json({
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter send/receive state',
                },
                400,
            );
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
                res.json(
                    {
                        message: 'Invalid availability data',
                        success: false,
                    },
                    400,
                );
                return resolve();
            }

            const person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                        success: false,
                    },
                    400,
                );
                return resolve();
            }

            const result = await saveAvailabilityData(person, availability);

            res.json(result);
        } catch (error) {
            console.error('Error in putAvailability:', error);
            res.json(
                {
                    message: error.message || 'Error updating availability',
                    success: false,
                },
                400,
            );
        }

        resolve();
    });
}

function putMode(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, mode_token, active } = req.body;

            if (!mode_token || typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Mode token and active state required',
                    },
                    400,
                );
                return resolve();
            }

            let mapping = filterMappings.modes;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Modes filter not found',
                    },
                    400,
                );
                return resolve();
            }

            const person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                        success: false,
                    },
                    400,
                );
                return resolve();
            }

            let modes = await getModes();

            const mode = modes?.byToken?.[mode_token];
            const soloMode = modes?.byToken?.['mode-solo'];

            if (!mode) {
                res.json(
                    {
                        message: 'Invalid mode token',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let now = timeNow();

            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);

            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                const [id] = await conn('persons_filters').insert(baseEntry);

                filterData = {
                    ...baseEntry,
                    id,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            const filterItems = filterData.items;

            const existingItem = Object.values(filterItems).find(
                (item) => item[mapping.column] === mode.id,
            );
            const existingSolo = Object.values(filterItems).find(
                (item) => item[mapping.column] === soloMode?.id,
            );

            // If selecting a non-solo mode and solo isn't present, add it first
            if (active && mode_token !== 'mode-solo' && !existingSolo && soloMode) {
                let soloEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    [mapping.column]: soloMode.id,
                    is_negative: false,
                    filterData
                });

                const [soloId] = await conn('persons_filters').insert(soloEntry);

                soloEntry.mode_token = 'mode-solo';

                filterItems[soloId] = {
                    ...soloEntry,
                    id: soloId,
                };
            }

            if (existingItem) {
                if (active) {
                    await conn('persons_filters').where('id', existingItem.id).update({
                        is_negative: false,
                        updated: now,
                        deleted: null,
                    });

                    // Update cache
                    existingItem.is_negative = false;
                    existingItem.updated = now;
                    delete existingItem.deleted;
                } else {
                    // Ensure we have more than one active mode before allowing deactivation
                    const activeItems = Object.values(filterItems).filter(
                        (item) => !item.is_negative && !item.deleted,
                    );

                    if (activeItems.length <= 1) {
                        res.json(
                            {
                                message: 'Cannot deactivate last active mode',
                            },
                            400,
                        );
                        return resolve();
                    }

                    await conn('persons_filters').where('id', existingItem.id).update({
                        is_negative: true,
                        updated: now,
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
                    filterData, // Pass parent filter to inherit states
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterEntry.mode_token = mode_token;
                filterItems[id] = {
                    ...filterEntry,
                    id,
                };
            }

            // Update cache
            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            await updateGridSets(
                person,
                {
                    [filter.token]: filterData,
                },
                filter.token,
            );

            res.json({
                success: true,
            });
        } catch (error) {
            console.error('Modes error:', error);

            res.json(
                {
                    message: error.message || 'Error updating modes',
                    success: false,
                },
                400,
            );
        }

        resolve();
    });
}

function putNetworks(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, network_token, active, is_any_network, is_all_verified } =
                req.body;

            // Validate required fields
            if (typeof network_token !== 'string' || typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Network token and active state required',
                    },
                    400,
                );
                return resolve();
            }

            // Get filter and mapping data
            let mapping = filterMappings.networks;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Networks filter not found',
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            // Get networks data
            let { networks } = await getNetworksForFilters();

            if (!networks?.length) {
                res.json(
                    {
                        message: 'No networks available',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                const [id] = await conn(mapping.filters_table).insert({
                    person_id: person.id,
                    created: now,
                    updated: now,
                });

                filterData = {
                    ...baseEntry,
                    id,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            // Handle any network
            if (typeof is_any_network === 'boolean') {
                if (is_any_network !== filterData.is_any_network) {
                    filterData.is_any_network = is_any_network;
                    filterData.is_all_verified = is_any_network
                        ? true
                        : filterData.is_all_verified || false;

                    await conn(mapping.filters_table)
                        .where('person_id', person.id)
                        .where('id', filterData.id)
                        .update({
                            is_any_network: is_any_network,
                            is_all_verified: filterData.is_all_verified,
                            updated: timeNow(),
                        });
                }
            }

            // Handle verified networks
            if (typeof is_all_verified === 'boolean') {
                if (is_all_verified !== filterData.is_all_verified) {
                    filterData.is_all_verified = is_all_verified || false;

                    await conn(mapping.filters_table)
                        .where('person_id', person.id)
                        .where('id', filterData.id)
                        .update({
                            is_all_verified: filterData.is_all_verified,
                            updated: timeNow(),
                        });
                }
            }

            // Handle individual network selection
            if (!['any', 'any_verified'].includes(network_token)) {
                const network = networks.find((n) => n.network_token === network_token);

                if (!network) {
                    res.json(
                        {
                            message: 'Invalid network token',
                        },
                        400,
                    );
                    return resolve();
                }

                // Prevent deselecting own network
                if (network.is_self) {
                    res.json(
                        {
                            message: 'Cannot deselect own network',
                        },
                        400,
                    );

                    return resolve();
                }

                const existingItem = Object.values(filterData.items).find(
                    (item) => item.network_token === network_token,
                );

                if (existingItem) {
                    // Update existing item
                    existingItem.is_active = active;
                    existingItem.updated = now;

                    await conn(mapping.filters_table)
                        .where('person_id', person.id)
                        .where('id', existingItem.id)
                        .update({
                            is_active: active,
                            updated: now,
                        });
                } else {
                    // Create new network selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        network_id: network.id,
                        network_token: network_token,
                        is_active: active,
                    });

                    const [id] = await conn(mapping.filters_table).insert({
                        person_id: person.id,
                        network_id: network.id,
                        is_active: active,
                        created: timeNow(),
                        updated: timeNow(),
                    });

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            // Update cache
            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            await updateGridSets(
                person,
                {
                    [filter.token]: filterData,
                },
                filter.token,
            );

            res.json(filterData);
        } catch (error) {
            console.error('Networks error:', error);
            res.json(
                {
                    message: error.message || 'Error updating networks',
                    success: false,
                },
                400,
            );
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
                res.json(
                    {
                        message: 'Valid filter token and rating (0-5) required',
                    },
                    400,
                );
                return resolve();
            }

            // Get filter and mapping data
            let filters = await getFilters();
            let filter = filters.byToken[filter_token];
            let mapping = filterMappings[filter_token];

            if (!filter || !mapping) {
                res.json(
                    {
                        message: 'Invalid filter',
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter_token);
            let now = timeNow();

            if (filterData) {
                // Update existing filter
                await conn('persons_filters')
                    .where('id', filterData.id)
                    .update({
                        filter_value: parseFloat(rating.toFixed(1)),
                        updated: now,
                    });

                filterData.filter_value = parseFloat(rating.toFixed(1));
                filterData.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value: parseFloat(rating.toFixed(1)),
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterData = {
                    ...filterEntry,
                    id,
                };
            }

            await cacheService.hSet(person_filter_cache_key, filter_token, filterData);

            res.json({
                success: true,
            });
        } catch (e) {
            console.error(e);

            res.json(
                {
                    message: 'Error updating review rating',
                },
                400,
            );
        }

        resolve();
    });
}

function putAge(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, min_age, max_age } = req.body;

            // Validate inputs
            if (
                typeof min_age !== 'number' ||
                typeof max_age !== 'number' ||
                min_age < minAge ||
                max_age > maxAge ||
                min_age > max_age
            ) {
                res.json(
                    {
                        message: `Valid age range required (${minAge}-${maxAge})`,
                    },
                    400,
                );
                return resolve();
            }

            // Get filter data
            let filters = await getFilters();
            let filter = filters.byToken['ages'];

            if (!filter) {
                res.json(
                    {
                        message: 'Age filter not found',
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            let max_age_value = max_age !== maxAge ? max_age : null;

            if (filterData) {
                // Update existing filter
                await conn('persons_filters').where('id', filterData.id).update({
                    filter_value_min: min_age,
                    filter_value_max: max_age_value,
                    updated: now,
                });

                filterData.filter_value_min = min_age;
                filterData.filter_value_max = max_age_value;
                filterData.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value_min: min_age,
                    filter_value_max: max_age_value,
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterData = {
                    ...filterEntry,
                    id,
                };
            }

            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            res.json({
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating age range',
                },
                400,
            );
        }

        resolve();
    });
}

function putGender(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            const { person_token, gender_token, active } = req.body;

            if (!gender_token || typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Gender token and active state required',
                    },
                    400,
                );
                return resolve();
            }

            let mapping = filterMappings.genders;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Gender filter not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let genders = await getGenders(true);
            let anyOption = genders.find((item) => item.token === 'any');

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                // Create base filter entry in database
                const [id] = await conn('persons_filters').insert(baseEntry);

                filterData = {
                    ...baseEntry,
                    id,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            const filterItems = filterData.items;

            // Get existing 'any' selection if it exists
            const existingAny = Object.values(filterItems).find(
                (item) => item[mapping.column] === anyOption.id,
            );

            // Handle 'any' gender selection
            if (gender_token === 'any' && active) {
                // Mark all non-any items as negative
                await conn('persons_filters').whereIn('id', Object.keys(filterData.items)).update({
                    is_negative: true,
                    updated: now,
                });

                for (let id in filterData.items) {
                    filterData.items[id].is_negative = true;
                    filterData.items[id].updated = now;
                }

                // Create or update 'any' entry
                if (existingAny) {
                    await conn('persons_filters').where('id', existingAny.id).update({
                        is_negative: false,
                        updated: now,
                    });

                    existingAny.is_negative = false;
                    existingAny.updated = now;
                } else {
                    const anyEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: anyOption.id,
                        is_negative: false,
                        filterData,
                    });

                    const [id] = await conn('persons_filters').insert(anyEntry);

                    filterData.items[id] = {
                        ...anyEntry,
                        id,
                    };
                }
            }
            // Handle specific gender selection
            else {
                // Find matching gender from data
                let gender = genders.find((g) => g.token === gender_token);

                if (!gender) {
                    res.json(
                        {
                            message: 'Invalid gender token',
                        },
                        400,
                    );
                    return resolve();
                }

                // Mark 'any' selection as negative if it exists
                if (existingAny) {
                    await conn('persons_filters').where('id', existingAny.id).update({
                        is_negative: true,
                        updated: now,
                    });

                    existingAny.is_negative = true;
                    existingAny.updated = now;
                }

                // Check for existing selection
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === gender.id,
                );

                if (existingItem) {
                    // Update existing entry
                    await conn('persons_filters').where('id', existingItem.id).update({
                        is_negative: !active,
                        updated: now,
                    });

                    existingItem.is_negative = !active;
                    existingItem.updated = now;
                } else {
                    // Create new gender selection
                    const filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: gender.id,
                        is_negative: !active,
                    });

                    const [id] = await conn('persons_filters').insert(filterEntry);

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            await updateGridSets(
                person,
                {
                    [filter.token]: filterData,
                },
                filter.token,
            );

            res.json({
                data: filterData,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
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
                res.json(
                    {
                        message: 'Valid distance required (1-60 miles)',
                    },
                    400,
                );
                return resolve();
            }

            // Get filter data
            let filters = await getFilters();
            let filter = filters.byToken['distance'];

            if (!filter) {
                res.json(
                    {
                        message: 'Distance filter not found',
                    },
                    400,
                );
                return resolve();
            }

            // Get person
            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            if (filterData) {
                // Update existing filter
                await conn('persons_filters').where('id', filterData.id).update({
                    filter_value: distance.toString(),
                    updated: now,
                });

                filterData.filter_value = distance;
                filterData.updated = now;
            } else {
                // Create new filter entry
                const filterEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                    filter_value: distance,
                });

                const [id] = await conn('persons_filters').insert(filterEntry);

                filterData = {
                    ...filterEntry,
                    id,
                };
            }

            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            res.json({
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating distance',
                },
                400,
            );
        }

        resolve();
    });
}

function putActivityTypes(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let filterKey = 'activity_types';

            const { activities, person_token, active } = req.body;

            if (!activities || typeof activities !== 'object' || typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid activities data',
                    },
                    400,
                );
                return resolve();
            }

            const person = await getPerson(person_token);

            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let conn = await dbService.conn();
            let now = timeNow();

            // Get filters data
            let filters = await getFilters();
            let filter = filters.byToken[filterKey];

            if (!filter) {
                res.json(
                    {
                        message: 'Activity types filter not found',
                    },
                    400,
                );
                return resolve();
            }

            let activityTypes = await getActivityTypesMapping();
            let person_filter_cache_key = cacheService.keys.person_filters(person.person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);

            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            }

            // Prepare batch operations
            let batchInserts = [];
            let batchUpdateIds = [];

            // Process each activity
            for (let [token, isActive] of Object.entries(activities)) {
                if (token === 'all') continue; // Skip 'all' token as it's handled separately

                let activityTypeId = activityTypes[token];
                if (!activityTypeId) continue;

                activityTypeId = parseInt(activityTypeId);

                // Find existing item for this activity
                const existingItem = Object.values(filterData.items).find(
                    (item) => item.activity_type_id === activityTypeId,
                );

                if (existingItem) {
                    // Update existing item
                    batchUpdateIds.push(existingItem.id);
                    filterData.items[existingItem.id].is_negative = !active;
                    filterData.items[existingItem.id].updated = now;
                } else {
                    if (active) {
                        continue;
                    }

                    // Create new item if not active
                    const newItem = {
                        filter_id: filter.id,
                        person_id: person.id,
                        activity_type_id: activityTypeId,
                        is_negative: true,
                        created: now,
                        updated: now,
                    };

                    batchInserts.push(newItem);
                }
            }

            // Handle 'all' token separately
            if ('all' in activities) {
                if (Object.keys(filterData.items).length) {
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_negative: false,
                            updated: now,
                        });

                    // Update cache directly for all items
                    for (let id in filterData.items) {
                        filterData.items[id].is_negative = false;
                        filterData.items[id].updated = now;
                    }
                }
            } else {
                // Execute batch operations
                if (batchInserts.length) {
                    await dbService.batchInsert('persons_filters', batchInserts, true);

                    // Update cache with new items
                    for (let item of batchInserts) {
                        filterData.items[item.id] = {
                            ...item,
                            id: item.id,
                        };
                    }
                }

                if (batchUpdateIds.length) {
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .whereIn('id', batchUpdateIds)
                        .update({
                            is_negative: !active,
                            updated: now,
                        });
                }
            }

            // Update cache
            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            res.json(filterData);
        } catch (error) {
            console.error('Activity types error:', error);
            res.json(
                {
                    message: error.message || 'Error updating activity types',
                    success: false,
                },
                400,
            );
        }

        resolve();
    });
}

function putSchools(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, hash_token, token, active, is_delete } = req.body;

            if (typeof token !== 'string') {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof hash_token !== 'string' && token !== 'any') {
                res.json(
                    {
                        message: 'Hash token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            let sectionData = sectionsData.schools;
            let mapping = filterMappings.schools;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            //find option
            let cache_key = sectionData.cacheKeys.schools.byHashKey(hash_token);
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters
                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    filterData.items[id].is_active = false;
                    filterData.items[id].updated = now;
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                        hash_token: hash_token,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putMovies(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, table_key, token, active, is_delete } = req.body;

            let personFilterKey = 'movies';

            if (!token) {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof table_key !== 'string') {
                res.json(
                    {
                        message: 'Invalid table key',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            //validate table key
            let sectionData = sectionsData.movies;
            let mapping = null;

            if (table_key === 'genres') {
                mapping = filterMappings.movie_genres;
            } else if (table_key === 'movies') {
                mapping = filterMappings.movies;
            }

            if (!mapping) {
                res.json(
                    {
                        message: 'Mapping not found',
                    },
                    400,
                );
                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            if (!sectionData.cacheKeys[table_key]) {
                res.json(
                    {
                        message: 'Cache key not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let cache_key = sectionData.cacheKeys[table_key].byHash;
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, personFilterKey);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters for table key

                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    let item = filterData.items[id];

                    if (item.table_key === table_key) {
                        item.is_active = false;
                        item.updated = now;
                    }
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.table_key = table_key;
                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, personFilterKey, filterData);

            res.json({
                id: id,
                data: filterData,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putTvShows(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, table_key, token, active, is_delete } = req.body;

            let personFilterKey = 'tv_shows';

            if (!token) {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof table_key !== 'string') {
                res.json(
                    {
                        message: 'Invalid table key',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            //validate table key
            let sectionData = sectionsData.tv_shows;
            let mapping = null;

            if (table_key === 'genres') {
                mapping = filterMappings.tv_show_genres;
            } else if (table_key === 'shows') {
                mapping = filterMappings.tv_shows;
            }

            if (!mapping) {
                res.json(
                    {
                        message: 'Mapping not found',
                    },
                    400,
                );
                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            if (!sectionData.cacheKeys[table_key]) {
                res.json(
                    {
                        message: 'Cache key not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let cache_key = sectionData.cacheKeys[table_key].byHash;
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, personFilterKey);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters for table key

                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    let item = filterData.items[id];

                    if (item.table_key === table_key) {
                        item.is_active = false;
                        item.updated = now;
                    }
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.table_key = table_key;
                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, personFilterKey, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putInstruments(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, token, active, is_delete, secondary } = req.body;

            if (!token) {
                res.json(
                    {
                        message: 'Instrument token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof secondary !== 'undefined' && !Array.isArray(secondary)) {
                res.json(
                    {
                        message: 'Invalid secondary data',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete, secondary].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            if (secondary) {
                //check that all values are valid
                let areValid = secondary.every((item) =>
                    sectionsData.instruments.secondary.instruments.options.includes(item),
                );

                if (!secondary.includes('any') && !areValid) {
                    res.json(
                        {
                            message: 'Invalid secondary format',
                        },
                        400,
                    );
                    return resolve();
                }
            }

            let mapping = filterMappings.instruments;
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Instruments filter not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let instruments = await allInstruments();
            let option = instruments.byToken[token];

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, filter.token);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters
                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    filterData.items[id].is_active = false;
                    filterData.items[id].updated = now;
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof secondary !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                secondary_level: JSON.stringify(secondary),
                                updated: now,
                                deleted: null,
                            });

                        existingItem.secondary = secondary;
                    } else if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, filter.token, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putWork(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, table_key, token, active, is_delete } = req.body;

            let personFilterKey = 'work';

            if (!token) {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof table_key !== 'string') {
                res.json(
                    {
                        message: 'Invalid table key',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            //validate table key
            let sectionData = sectionsData.work;
            let mapping = filterMappings[`work_${table_key}`];
            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            if (!sectionData.cacheKeys[table_key]) {
                res.json(
                    {
                        message: 'Cache key not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let cache_key = sectionData.cacheKeys[table_key].byHash;
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, personFilterKey);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters for table key

                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    let item = filterData.items[id];

                    if (item.table_key === table_key) {
                        item.is_active = false;
                        item.updated = now;
                    }
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.table_key = table_key;
                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, personFilterKey, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putMusic(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, table_key, token, active, is_delete } = req.body;

            let personFilterKey = 'music';

            if (!token) {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof table_key !== 'string') {
                res.json(
                    {
                        message: 'Invalid table key',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            //validate table key
            let sectionData = sectionsData.music;
            let mapping = filterMappings[`music_${table_key}`];

            if (!mapping) {
                res.json(
                    {
                        message: 'Mapping not found',
                    },
                    400,
                );
                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            if (!sectionData.cacheKeys[table_key]) {
                res.json(
                    {
                        message: 'Cache key not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let cache_key = sectionData.cacheKeys[table_key].byHash;
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, personFilterKey);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters for table key

                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    let item = filterData.items[id];

                    if (item.table_key === table_key) {
                        item.is_active = false;
                        item.updated = now;
                    }
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.table_key = table_key;
                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, personFilterKey, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

function putSports(req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let id;

            const { person_token, table_key, token, active, is_delete, secondary } = req.body;

            let personFilterKey = 'sports';

            if (!token) {
                res.json(
                    {
                        message: 'Token required',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof table_key !== 'string') {
                res.json(
                    {
                        message: 'Invalid table key',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof active !== 'undefined' && typeof active !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid active value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof is_delete !== 'undefined' && typeof is_delete !== 'boolean') {
                res.json(
                    {
                        message: 'Invalid delete value',
                    },
                    400,
                );
                return resolve();
            }

            if (typeof secondary !== 'undefined' && !Array.isArray(secondary)) {
                res.json(
                    {
                        message: 'Invalid secondary data',
                    },
                    400,
                );
                return resolve();
            }

            if (![active, is_delete, secondary].some((item) => typeof item !== 'undefined')) {
                res.json(
                    {
                        message: 'At least one field required',
                    },
                    400,
                );
                return resolve();
            }

            //validate table key
            let sectionData = sectionsData.sports;
            let mapping = filterMappings[`sports_${table_key}`];

            if (!mapping) {
                res.json(
                    {
                        message: 'Mapping not found',
                    },
                    400,
                );
                return resolve();
            }

            let filters = await getFilters();
            let filter = filters.byToken[mapping.token];

            if (!filter) {
                res.json(
                    {
                        message: 'Filter not found',
                    },
                    400,
                );
                return resolve();
            }

            if (!sectionData.cacheKeys[table_key]) {
                res.json(
                    {
                        message: 'Cache key not found',
                    },
                    400,
                );
                return resolve();
            }

            let person = await getPerson(person_token);
            if (!person) {
                res.json(
                    {
                        message: 'Person not found',
                    },
                    400,
                );
                return resolve();
            }

            let cache_key = sectionData.cacheKeys[table_key].byHash;
            let option = await cacheService.hGetItem(cache_key, token);

            if (token !== 'any' && !option) {
                res.json(
                    {
                        message: 'Invalid token',
                    },
                    400,
                );

                return resolve();
            }

            let conn = await dbService.conn();
            let person_filter_cache_key = cacheService.keys.person_filters(person_token);
            let filterData = await getPersonFilterForKey(person, personFilterKey);
            let now = timeNow();

            // Initialize filter structure if it doesn't exist
            if (!filterData) {
                const baseEntry = createFilterEntry(filter.id, {
                    person_id: person.id,
                });

                filterData = {
                    ...baseEntry,
                    items: {},
                };
            } else if (!filterData.items) {
                filterData.items = {};
            }

            if (token === 'any') {
                // Handle 'any' selection - clear all existing filters for table key

                if (Object.keys(filterData.items).length)
                    await conn('persons_filters')
                        .where('person_id', person.id)
                        .where('filter_id', filter.id)
                        .update({
                            is_active: false,
                            updated: now,
                        });

                // Update cache
                for (let id in filterData.items) {
                    let item = filterData.items[id];

                    if (item.table_key === table_key) {
                        item.is_active = false;
                        item.updated = now;
                    }
                }
            } else {
                // Find existing item for option
                const existingItem = Object.values(filterData.items).find(
                    (item) => item[mapping.column] === option.id,
                );

                if (existingItem) {
                    id = existingItem.id;

                    if (typeof secondary !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                secondary_level: JSON.stringify(secondary),
                                updated: now,
                                deleted: null,
                            });

                        existingItem.secondary = secondary;
                    } else if (typeof is_delete !== 'undefined') {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                updated: now,
                                deleted: now,
                            });

                        existingItem.deleted = now;
                    } else {
                        await conn('persons_filters')
                            .where('person_id', person.id)
                            .where('id', existingItem.id)
                            .update({
                                is_active: active,
                                updated: now,
                                deleted: null,
                            });

                        existingItem.is_active = active;
                    }

                    if (typeof is_delete === 'undefined') {
                        existingItem.deleted = null;
                    }
                } else {
                    // Create new relationship status selection
                    let filterEntry = createFilterEntry(filter.id, {
                        person_id: person.id,
                        [mapping.column]: option.id,
                        is_active: active,
                    });

                    [id] = await conn('persons_filters').insert(filterEntry);

                    filterEntry.table_key = table_key;
                    filterEntry.token = token;
                    filterEntry.name = option.name;

                    filterData.items[id] = {
                        ...filterEntry,
                        id,
                    };
                }
            }

            await cacheService.hSet(person_filter_cache_key, personFilterKey, filterData);

            res.json({
                id: id,
                success: true,
            });
        } catch (e) {
            console.error(e);
            res.json(
                {
                    message: 'Error updating filter',
                },
                400,
            );
        }

        resolve();
    });
}

module.exports = {
    getFiltersOptions,
    getMatches,
    putActive,
    putImportance,
    putSendReceive,
    putAvailability,
    putMode,
    putNetworks,
    putReviewRating,
    putAge,
    putGender,
    putDistance,
    putActivityTypes,
    putSchools,
    putMovies,
    putTvShows,
    putWork,
    putMusic,
    putInstruments,
    putSports,
    handleFilterUpdate,
};
