let cacheService = require('../services/cache');
let gridService = require('../services/grid');

const { getPerson } = require('./persons');
const { getPersonFilters } = require('./filters');

function getMatches(person) {
    let neighbor_grid_tokens = [];
    let person_tokens_for_grids = new Set();
    let offlineGroup = new Set();
    let matches = [];

    function personsForGridToken() {
        return new Promise(async (resolve, reject) => {

        });
    }

    function availabilityMatches(grid_token) {
        return new Promise(async (resolve, reject) => {
            try {
                let grid_cache_key = cacheService.keys.persons_grid(grid_token);

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

            let person_filters = await getPersonFilters(person);

             let availability = await availabilityMatches(person?.grid?.token);
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