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

        let location_obj = parseSearch(search, true);

        try {
            let city_key = `${cacheService.keys.cities_prefix}${location_obj.city}`;

            let city_ids = await cacheService.getSortedSet(city_key);

            if (!city_ids.length) {
                return resolve([]);
            }

            // Get city details and calculate scores
            let pipeline = cacheService.conn.multi();

            for (let id of city_ids) {
                pipeline.hGetAll(`${cacheService.keys.city}${id}`);
            }

            let cities = await cacheService.execRedisMulti(pipeline);

            let results = cities
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
                .sort((a, b) => b.score - a.score);

            await addState(results);
            await addCountry(results);

            if(location_obj.state || location_obj.country) {
                results = results.filter(function (result) {
                    if(location_obj.state && location_obj.country) {
                        let state_match = stateMatch(result.state, location_obj.state);
                        let country_match = countryMatch(result.country, location_obj.country);

                        if(location_obj.parts === 2) {
                            return state_match || country_match;
                        }

                        return state_match && country_match;
                    } else if(location_obj.state) {
                        return stateMatch(result.state, location_obj.state);
                    } else if(location_obj.country) {
                        return countryMatch(result.country, location_obj.country);
                    } else {
                        return false;
                    }
                });
            } else {
                results = results.slice(0, limit);
            }

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
