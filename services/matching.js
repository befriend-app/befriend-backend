let cacheService = require('../services/cache');
let gridService = require('../services/grid');

const { getPerson } = require('./persons');
const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow } = require('./shared');

const DEFAULT_DISTANCE_MILES = 20;

function getMatches(person, activity_type = null) {
    let person_filters;
    let neighbor_grid_tokens = [];
    let exclude_person_tokens = new Set();
    let person_tokens = new Set();
    let online_person_tokens = new Set();
    let offline_person_tokens = new Set();
    let person_modes = [];
    let matches = [];

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

                grids.map(grid => {
                    if (!neighbor_grid_tokens.includes(grid.token)) {
                        neighbor_grid_tokens.push(grid.token);
                    }
                });

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
                        person_tokens.add(token);
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    function filterByOnlineStatus() {
        return new Promise(async (resolve, reject) => {
            try {
                let pipeline_online = cacheService.startPipeline();

                for (let grid_token of neighbor_grid_tokens) {
                    pipeline_online.sMembers(
                        cacheService.keys.persons_grid_set(grid_token, 'online')
                    );
                }

                let results_online = await cacheService.execPipeline(pipeline_online);

                for (let grid of results_online) {
                    for (let token of grid) {
                        online_person_tokens.add(token);
                    }
                }

                for (let token of person_tokens) {
                    if (!online_person_tokens.has(token)) {
                        exclude_person_tokens.add(token);
                        offline_person_tokens.add(token);
                    }
                }

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    function filterModes() {
        return new Promise(async (resolve, reject) => {
            try {
                // Get and validate initial modes
                let filter_modes = person.modes?.selected || [];

                // If no modes, default to solo
                if (!filter_modes.length) {
                    filter_modes = ['mode-solo'];
                }

                // Validate partner mode
                if (filter_modes.includes('mode-partner')) {
                    if (!person.modes?.partner ||
                        person.modes.partner.deleted ||
                        !person.modes.partner.gender_id) {
                        filter_modes = filter_modes.filter(item => item !== 'mode-partner');
                    }
                }

                // Validate kids mode
                if (filter_modes.includes('mode-kids')) {
                    if (!person.modes?.kids) {
                        filter_modes = filter_modes.filter(item => item !== 'mode-kids');
                    } else {
                        const hasValidKid = Object.values(person.modes.kids).some(kid =>
                            !kid.deleted &&
                            kid.gender_id &&
                            kid.age_id &&
                            kid.is_active
                        );

                        if (!hasValidKid) {
                            filter_modes = filter_modes.filter(item => item !== 'mode-kids');
                        }
                    }
                }

                // Apply mode filters if active
                if (person_filters.modes?.is_active &&
                    person_filters.modes.is_send &&
                    person_filters.modes.items) {

                    filter_modes = filter_modes.filter(mode => {
                        const filterItem = Object.values(person_filters.modes.items).find(item =>
                            item.mode_token === mode
                        );
                        return filterItem && filterItem.is_active && !filterItem.is_negative;
                    });
                }

                // Default to solo mode if no valid modes
                if (!filter_modes.length) {
                    filter_modes = ['mode-solo'];
                }

                // Get mode matches
                let pipeline_modes = cacheService.startPipeline();

                for (let mode of filter_modes) {
                    for (let grid_token of neighbor_grid_tokens) {
                        pipeline_modes.sMembers(
                            cacheService.keys.persons_grid_set(grid_token, mode)
                        );
                    }
                }

                let results = await cacheService.execPipeline(pipeline_modes);
                resolve(results);

            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!person) {
                return reject("Person required");
            }

            person_filters = await getPersonFilters(person);

            await getGridTokens();
            await getGridPersonTokens();
            await filterByOnlineStatus();
            await filterModes();

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