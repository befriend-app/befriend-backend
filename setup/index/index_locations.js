const cacheService = require('../../services/cache');
const { loadScriptEnv } = require('../../services/shared');
const dbService = require('../../services/db');

loadScriptEnv();

let {prefixLimit, countryPrefixLimit} = require('../../services/locations');

function indexCities() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            console.log('Index Cities');

            let countries = await conn('open_countries');
            let countries_dict = {};

            countries.map((country) => {
                countries_dict[country.id] = country;
            });

            let cities = await conn('open_cities').whereNotNull('population');
            let pipeline = cacheService.conn.multi();

            // Cities by country
            const citiesByCountry = {};

            for (let city of cities) {
                let country_code = countries_dict[city.country_id].country_code;

                if (!citiesByCountry[country_code]) {
                    citiesByCountry[country_code] = {};
                }

                citiesByCountry[country_code][city.id] = JSON.stringify({
                    id: city.id,
                    name: city.city_name,
                    state_id: city.state_id || '',
                    country_id: city.country_id || '',
                    population: Math.floor(city.population),
                    ll: [Number(city.lat.toFixed(4)), Number(city.lon.toFixed(4))]
                });
            }

            for (const [countryCode, cities] of Object.entries(citiesByCountry)) {
                pipeline.hSet(cacheService.keys.cities_country(countryCode), cities);
            }

            // Create word prefix groups
            const prefixGroups = {};

            for (let city of cities) {
                const words = city.city_name.toLowerCase().split(/\s+/);

                // Index each word
                for (let word of words) {
                    // Skip very short words
                    if (word.length < 2) continue;

                    for (let i = 1; i <= Math.min(word.length, prefixLimit); i++) {
                        const prefix = word.slice(0, i);
                        
                        if (!prefixGroups[prefix]) {
                            prefixGroups[prefix] = [];
                        }

                        let country_code = countries_dict[city.country_id].country_code;

                        prefixGroups[prefix].push({
                            score: Math.floor(city.population),
                            value: `${city.id}:${country_code}`
                        });

                        //add to country prefix for small number of characters
                        if (prefix.length <= countryPrefixLimit) {
                            pipeline.zAdd(
                                cacheService.keys.city_country_prefix(country_code, prefix),
                                [
                                    {
                                        value: city.id.toString(),
                                        score: city.population,
                                    },
                                ],
                            );
                        }
                    }
                }

                // Also index start of full name for direct matches
                const nameLower = city.city_name.toLowerCase();
                
                for (let i = 1; i <= Math.min(nameLower.length, prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);
                    
                    if (!prefixGroups[prefix]) {
                        prefixGroups[prefix] = [];
                    }

                    let country_code = countries_dict[city.country_id].country_code;

                    prefixGroups[prefix].push({
                        score: Math.floor(city.population),
                        value: `${city.id}:${country_code}`
                    });
                }
            }

            console.log("Add prefix groups");
            
            for (const [prefix, cities] of Object.entries(prefixGroups)) {
                if (cities.length > 0) {
                    pipeline.zAdd(cacheService.keys.cities_prefix(prefix), cities);
                }
            }

            console.log("Exec pipeline");
            await pipeline.execAsPipeline();

        } catch (e) {
            console.error(e);
            return reject();
        }
        resolve();
    });
}

function indexStates() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Index States');

            let conn = await dbService.conn();

            let states = await conn('open_states');

            let pipeline = cacheService.conn.multi();

            for (let state of states) {
                const state_key = cacheService.keys.state(state.id);

                pipeline.hSet(state_key, {
                    id: state.id,
                    name: state.state_name,
                    short: state.state_short,
                    country_id: state.country_id,
                    population: state.population ? state.population : '',
                    lat: state.lat ? state.lat : '',
                    lon: state.lon ? state.lon : '',
                });
            }

            await pipeline.execAsPipeline();

            return resolve();
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function indexCountries() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Index Countries');

            let conn = await dbService.conn();

            let pipeline = cacheService.conn.multi();

            let countries = await conn('open_countries');

            for (let country of countries) {
                const country_key = cacheService.keys.country(country.id);

                pipeline.hSet(country_key, {
                    id: country.id,
                    name: country.country_name,
                    code: country.country_code,
                    emoji: country.emoji,
                    population: country.population ? country.population : '',
                    lat: country.lat,
                    lon: country.lon,
                    min_lat: country.min_lat,
                    max_lat: country.max_lat,
                    min_lon: country.min_lon,
                    max_lon: country.max_lon,
                    wiki_code: country.wiki_code,
                });
            }

            await pipeline.execAsPipeline();

            resolve();
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

async function searchCities(query, limit = 10) {
    const searchTerm = query.toLowerCase();
    const results = new Set();

    try {
        let query_prefix = searchTerm.substring(0, prefixLimit);
        
        const matches = await cacheService.getSortedSetByScore(cacheService.keys.cities_prefix(query_prefix));

        for (const match of matches) {
            const [cityId, countryCode] = match.split(':');

            // Get city data
            const cityData = await cacheService.conn.hGet(`cities:countries:${countryCode}`, cityId);

            if (cityData) {
                results.add(cityData);
            }

            if (results.size >= limit) break;
        }

        return Array.from(results).map(r => JSON.parse(r));
    } catch (e) {
        console.error('Search error:', e);
        return [];
    }
}

module.exports = {
    main: async function(is_me) {
        try {
            console.log('Index Locations');

            await cacheService.init();
            await indexCountries();
            await indexStates();
            await indexCities();

            if(is_me) {
                process.exit();
            }
        } catch (e) {
            console.error(e);
        }
    },
};

if (require.main === module) {
    (async function() {
        await module.exports.main(true);
    })();
}