let cacheService = require('../services/cache');
let gridService = require('../services/grid');

const { getPerson } = require('./persons');
const { getPersonFilters } = require('./filters');
const { kms_per_mile, timeNow } = require('./shared');

const DEFAULT_DISTANCE_MILES = 20;

function getMatches(person, activity_type = null) {
    let neighbor_grid_tokens = [];
    let exclude_person_tokens = new Set();
    let person_tokens = new Set();
    let online_person_tokens = new Set();
    let offline_person_tokens = new Set();
    let matches = [];

    function personsForGridToken() {
        return new Promise(async (resolve, reject) => {

        });
    }

    function availabilityMatches(grid_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let grid_cache_key = cacheService.keys.persons_grid_set(grid_token, 'location');

                let persons_tokens = await cacheService.getSetMembers(grid_cache_key);

                if (!persons_tokens?.length) {
                    return resolve(
                        { matches: [] }
                    );
                }

                let filterOffSet = new Set();

                let filters_pipeline = cacheService.startPipeline();

                for(let person_token of persons_tokens) {
                    try {
                        let person = await getPerson(person_token);

                        if(!person) {
                            continue;
                        }
                        let t = performance.now();
                        let filters = await getPersonFilters(person);

                        console.log(performance.now() - t);

                        debugger;
                    } catch(e) {
                        console.error(e);
                    }
                }

                let filter_pipeline_results = await cacheService.execPipeline(filters_pipeline);

                resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }

    return new Promise(async (resolve, reject) => {
        try {
            if(!person) {
                return reject("Person required");
            }

             //get grids to search based on person's current grid and filter setting
             let person_grid_token = person.grid?.token;

            if(!person_grid_token) {
                return reject('Grid token required');
            }

            //initiate grids with person's grid token
            neighbor_grid_tokens.push(person_grid_token);

            //get all filters data
            let person_filters = await getPersonFilters(person);

            //use default distance or custom if set
            let max_distance = DEFAULT_DISTANCE_MILES;

            //use custom distance if (1) distance filter is active (2) send is on (3) has a value
            if(person_filters.distance?.is_active && person_filters.distance.is_send && person_filters.distance.filter_value) {
                max_distance = person_filters.distance.filter_value;
            }

            max_distance *= kms_per_mile;

            //add additional grid tokens
            let grids = await gridService.findNearby(person.location_lat, person.location_lon, max_distance);

            grids.map(grid=> !(neighbor_grid_tokens.includes(grid.token)) ? neighbor_grid_tokens.push(grid.token) : null);

            //get all person tokens across selected grids
            let pipeline_persons = cacheService.startPipeline();

            for(let grid_token of neighbor_grid_tokens) {
                pipeline_persons.sMembers(cacheService.keys.persons_grid_set(grid_token, 'location'));
            }

            let results_persons = await cacheService.execPipeline(pipeline_persons);

            for(let grid_persons of results_persons) {
                for(let token of grid_persons) {
                    person_tokens.add(token);
                }
            }

            //get online status for all person_tokens
            let pipeline_online = cacheService.startPipeline();

            for(let grid_token of neighbor_grid_tokens) {
                pipeline_online.sMembers(cacheService.keys.persons_grid_set(grid_token, 'online'));
            }

            let results_online = await cacheService.execPipeline(pipeline_online);

            //add to excluded if not online
            for(let grid of results_online) {
                for(let token of grid) {
                    online_person_tokens.add(token);
                }
            }

            for(let token of person_tokens) {
                if(!online_person_tokens.has(token)) {
                    exclude_person_tokens.add(token);
                    offline_person_tokens.add(token);
                }
            }

            //get availability later once set is reduced
            //skip activity types unless parameter provided

             // let availability = await availabilityMatches(person?.grid?.token);
        } catch(e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}


module.exports = {
    getMatches
}