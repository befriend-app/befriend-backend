const cacheService = require("../services/cache");
const dbService = require("./db");

const { getDistanceMeters, timeNow, normalizeSearch} = require("./shared");


function isCountry(str, min_char = 1) {
    str = str.toLowerCase();

    //codes
    for(let code of module.exports.countries.codes) {
        if(str.length >= min_char && code.startsWith(str)) {
            return true;
        }
    }

    //names
    for(let name of module.exports.countries.names) {
        if(str.length >= min_char && name.startsWith(str)) {
            return true;
        }
    }

    return false;
}

function loadCountries() {
    return new Promise(async (resolve, reject) => {
        if(module.exports.countries.names.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();
            let countries = await conn("open_countries");

            for(let c of countries) {
                module.exports.countries.names.push(c.country_name.toLowerCase());
                module.exports.countries.codes.push(c.country_code.toLowerCase());
            }
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function cityAutoComplete(search, userLat, userLon, maxDistance) {
    function addState(results) {
        return new Promise(async (resolve, reject) => {
            try {
                let pipeline = cacheService.conn.multi();

                for (let result of results) {
                    pipeline.hGetAll(`${cacheService.keys.state}${result.state_id}`);
                }

                let states = await cacheService.execRedisMulti(pipeline);

                for (let i = 0; i < states.length; i++) {
                    let state = states[i];
                    let result = results[i];

                    if (state) {
                        result.state = state;
                    }
                }

                resolve();
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    }

    function addCountry(results) {
        return new Promise(async (resolve, reject) => {
           try {
               let pipeline = cacheService.conn.multi();

               for (let result of results) {
                   pipeline.hGetAll(`${cacheService.keys.country}${result.country_id}`);
               }

               let countries = await cacheService.execRedisMulti(pipeline);

               for (let i = 0; i < countries.length; i++) {
                   let country = countries[i];
                   let result = results[i];

                   if (country) {
                       result.country = country;
                   }
               }

               resolve();
           } catch(e) {
               console.error(e);
               return reject();
           }
        });
    }

    function parseSearch(input, comma_only) {
        input = normalizeSearch(input);

        let parts = input.split(',').map(part => part.trim());

        if (!comma_only && parts.length === 1) {
            // If no commas, split by space
            parts = input.split(' ');
        }

        let result = {
            city: '',
            state: '',
            country: '',
            parts: parts.length
        };

        if (parts.length === 1) {
            // Only city
            result.city = parts[0];
        } else if (parts.length === 2) {
            // City and country, or city and state
            result.city = parts[0];
            result.country = isCountry(parts[1]) ? parts[1] : '';
            result.state = parts[1];
        } else if (parts.length >= 3) {
            // City, state, and country
            result.city = parts.slice(0, -2).join(' '); // Join multi-word cities
            result.state = parts[parts.length - 2];
            result.country = parts[parts.length - 1];

            // Check if the last part is actually a country
            if (!isCountry(result.country)) {
                result.city = parts.slice(0, -1).join(' ');
                result.state = parts[parts.length - 1];
                result.country = '';
            }
        }

        return result;
    }
    
    function stateMatch(state, compare) {
        if(!state || !state.name || !state.short) {
            return false;
        }

        if(state.name.toLowerCase().startsWith(compare)) {
            return true;
        }
        
        return state.short.toLowerCase().startsWith(compare);
    }
    
    function countryMatch(country, compare) {
        if(!country || !country.name || !country.code) {
            return false;
        }

        if(country.name.toLowerCase().startsWith(compare)) {
            return true;
        }

        return country.code.toLowerCase().startsWith(compare);
    }

    return new Promise(async (resolve, reject) => {
        let limit = 10;

        if (userLat) {
            userLat = parseFloat(userLat);
        }

        if (userLon) {
            userLon = parseFloat(userLon);
        }

        //get list of countries
        try {
            await loadCountries();
        } catch(e) {
            console.error(e);
        }

        let parsed_arr = [];

        parsed_arr.push(parseSearch(search, true));
        parsed_arr.push(parseSearch(search));

        if(JSON.stringify(parsed_arr[0]) === JSON.stringify(parsed_arr[1])) {
            parsed_arr = parsed_arr.slice(0, 1);
        }

        try {
            let results_arr = [];

            for(let parsed of parsed_arr) {
                let city_key = `${cacheService.keys.cities_prefix}${parsed.city}`;

                let city_ids = await cacheService.getSortedSet(city_key);

                if (!city_ids.length) {
                    results_arr.push([]);
                    continue;
                }

                // Get city details and calculate scores
                let pipeline = cacheService.conn.multi();

                for (let id of city_ids) {
                    pipeline.hGetAll(`${cacheService.keys.city}${id}`);
                }

                let cities = await cacheService.execRedisMulti(pipeline);

                await addState(cities);
                await addCountry(cities);

                if(parsed.state || parsed.country) {
                    cities = cities.filter(function (result) {
                        if(parsed.state && parsed.country) {
                            let state_match = stateMatch(result.state, parsed.state);
                            let country_match = countryMatch(result.country, parsed.country);

                            if(parsed.parts === 2) {
                                return state_match || country_match;
                            }

                            return state_match && country_match;
                        } else if(parsed.state) {
                            return stateMatch(result.state, parsed.state);
                        } else if(parsed.country) {
                            return countryMatch(result.country, parsed.country);
                        } else {
                            return false;
                        }
                    });
                }

                results_arr.push(cities);
            }

            //remove duplicates
            let city_id_dict = {};

            let results = [];

            for(let i = 0; i < results_arr.length; i++) {
                let arr = results_arr[i];

                for(let city of arr) {
                    if(!(city.id in city_id_dict)) {
                        city_id_dict[city.id] = true;
                        results.push(city);
                    }
                }
            }

            results = results
                .map(function (city) {
                    if (!city) return null;

                    // Convert types
                    city.population = parseInt(city.population);
                    city.lat = parseFloat(city.lat);
                    city.lon = parseFloat(city.lon);

                    // Calculate distance if coordinates provided
                    let distance = null;

                    if (userLat != null && userLon != null) {
                        distance = getDistanceMeters(
                            {
                                lat: userLat,
                                lon: userLon,
                            },
                            {
                                lat: city.lat,
                                lon: city.lon,
                            },
                        );

                        // Skip if beyond maxDistance
                        if (maxDistance && distance > maxDistance) {
                            return null;
                        }
                    }

                    // Calculate combined score
                    const populationScore = city.population / 500000; // Normalize to 500k
                    let score, distanceScore;

                    if (distance != null) {
                        distanceScore = (1000 * 1000) / (distance + 1);
                        score = (populationScore + distanceScore) / 2;
                    } else {
                        score = populationScore;
                    }

                    return {
                        ...city,
                        distance,
                        score,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);

            return resolve(results);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

module.exports = {
    countries: {
        codes: [],
        names: []
    },
    cityAutoComplete: cityAutoComplete,
};
