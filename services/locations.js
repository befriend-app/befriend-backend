const cacheService = require('../services/cache');
const dbService = require('./db');
const { getDistanceMeters, normalizeSearch, latLonLookup, timeNow } = require('./shared');

const LIMIT = 20;
const MIN_COUNTRY_CHARS = 1;
const MAX_PREFIX_LIMIT = 4;
const MAX_COUNTRY_PREFIX_LIMIT = 3;

const countries = {
    codes: [],
    names: [],
};

function loadCountries() {
    return new Promise(async (resolve, reject) => {
        if (countries.names.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();
            let dbCountries = await conn('open_countries');

            for (let c of dbCountries) {
                countries.names.push(c.country_name.toLowerCase());
                countries.codes.push(c.country_code.toLowerCase());
            }
            resolve();
        } catch (e) {
            console.error('Error loading countries:', e);
            reject(e);
        }
    });
}

function isCountry(str, minChar = MIN_COUNTRY_CHARS) {
    str = str.toLowerCase();
    return (
        countries.codes.some((code) => str.length >= minChar && code.startsWith(str)) ||
        countries.names.some((name) => str.length >= minChar && name.startsWith(str))
    );
}

function parseSearch(input, commaOnly = false) {
    input = normalizeSearch(input);
    let parts = commaOnly ? input.split(',').map((part) => part.trim()) : input.split(/[,\s]+/);

    let result = {
        city: '',
        state: '',
        country: '',
        parts: parts.length,
    };

    if (parts.length === 1) {
        result.city = parts[0];
    } else if (parts.length === 2) {
        result.city = parts[0];
        result.country = isCountry(parts[1]) ? parts[1] : '';
        result.state = parts[1];
    } else if (parts.length >= 3) {
        result.city = parts.slice(0, -2).join(' ');
        result.state = parts[parts.length - 2];
        result.country = parts[parts.length - 1];

        if (!isCountry(result.country)) {
            result.city = parts.slice(0, -1).join(' ');
            result.state = parts[parts.length - 1];
            result.country = '';
        }
    }

    return result;
}

function stateMatch(state, compare) {
    if (!state || !state.name || !state.short) {
        return false;
    }
    return (
        state.name.toLowerCase().startsWith(compare) ||
        state.short.toLowerCase().startsWith(compare)
    );
}

function countryMatch(country, compare) {
    if (!country || !country.name || !country.code) {
        return false;
    }
    return (
        country.name.toLowerCase().startsWith(compare) ||
        country.code.toLowerCase().startsWith(compare)
    );
}

function addLocationData(results, dataType) {
    return new Promise(async (resolve, reject) => {
        try {
            let pipeline = cacheService.conn.multi();

            for (let result of results) {
                if (dataType === 'state') {
                    pipeline.hGetAll(cacheService.keys.state(result[`${dataType}_id`]));
                } else if (dataType === 'country') {
                    pipeline.hGetAll(cacheService.keys.country(result[`${dataType}_id`]));
                }
            }

            let data = await cacheService.execMulti(pipeline);

            for (let i = 0; i < data.length; i++) {
                let item = data[i];
                let result = results[i];

                if (item) {
                    result[dataType] = item;
                }
            }

            resolve();
        } catch (e) {
            console.error(`Error adding ${dataType} data:`, e);
            reject(e);
        }
    });
}

function getCityCountryIds(parsed, locationCountry) {
    return new Promise(async (resolve, reject) => {
        try {
            let citiesCountry = new Set();

            if (locationCountry && parsed.city) {
                let countryPrefixKey = cacheService.keys.city_country_prefix(
                    locationCountry.code,
                    parsed.city.substring(0, MAX_COUNTRY_PREFIX_LIMIT),
                );

                let countryCityIds = await cacheService.getSortedSet(countryPrefixKey);

                for(let id of countryCityIds) {
                    citiesCountry.add(`${id}:${locationCountry.code}`);
                }
            }

            let cityKey = cacheService.keys.cities_prefix(parsed.city.substring(0, MAX_PREFIX_LIMIT));
            let globalCities = await cacheService.getSortedSetByScore(cityKey, 1000);

            for(let city of globalCities) {
                citiesCountry.add(city);
            }

            resolve(Array.from(citiesCountry));
        } catch (e) {
            console.error('Error getting city IDs:', e);
            reject(e);
        }
    });
}

function fetchCityDetails(cityCountryIds) {
    return new Promise(async (resolve, reject) => {
        try {
            let pipeline = cacheService.conn.multi();

            for (let item of cityCountryIds) {
                const [cityId, countryCode] = item.split(':');
                pipeline.hGet(cacheService.keys.cities_country(countryCode), cityId);
            }

            let cities = await cacheService.execMulti(pipeline);

            cities = cities.map(c => JSON.parse(c));

            resolve(cities);
        } catch (e) {
            console.error('Error fetching city details:', e);
            reject(e);
        }
    });
}

function filterCitiesByParsedCriteria(cities, parsed) {
    return cities.filter(function (result) {
        //handles limited prefix
        if(!result.name.toLowerCase().includes(parsed.city)) {
            return false;
        }

        if (parsed.state && parsed.country) {
            let stateMatches = stateMatch(result.state, parsed.state);
            let countryMatches = countryMatch(result.country, parsed.country);

            if (parsed.parts === 2) {
                return stateMatches || countryMatches;
            }

            return stateMatches && countryMatches;
        } else if (parsed.state) {
            return stateMatch(result.state, parsed.state);
        } else if (parsed.country) {
            return countryMatch(result.country, parsed.country);
        } else {
            return true;
        }
    });
}

function calculateCityScore(city, userLat, userLon, maxDistance, locationCountry) {
    // Convert types
    city.population = parseInt(city.population);
    city.lat = parseFloat(city.ll[0]);
    city.lon = parseFloat(city.ll[1]);

    city.is_user_country = false;

    // Is user location country
    if (city.country && locationCountry) {
        if (
            locationCountry.code.startsWith(city.country.code) ||
            locationCountry.code.startsWith(city.country.code)
        ) {
            city.is_user_country = true;
        }
    }

    // Calculate distance if coordinates provided
    let distance = null;

    if (userLat != null && userLon != null) {
        distance = getDistanceMeters(
            { lat: userLat, lon: userLon },
            { lat: city.lat, lon: city.lon },
        );

        // Skip if beyond maxDistance
        if (maxDistance && distance > maxDistance) {
            return null;
        }
    }

    // Calculate combined score
    const populationScore = city.population / 500000; // Normalize
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
}

function cityAutoComplete(search, userLat, userLon, maxDistance) {
    return new Promise(async (resolve, reject) => {
        try {
            await loadCountries();

            if (userLat) {
                userLat = parseFloat(userLat);
            }

            if (userLon) {
                userLon = parseFloat(userLon);
            }

            let locationCountry;

            try {
                locationCountry = await latLonLookup(userLat, userLon);
            } catch (e) {
                console.error('Error looking up location:', e);
            }

            let parsedSearches = [parseSearch(search, true), parseSearch(search)];

            if (JSON.stringify(parsedSearches[0]) === JSON.stringify(parsedSearches[1])) {
                parsedSearches = parsedSearches.slice(0, 1);
            }

            let results_arr = [];

            for (let parsed of parsedSearches) {
                let cityCountryIds = await getCityCountryIds(parsed, locationCountry);

                if (!cityCountryIds.length) {
                    results_arr.push([]);
                    continue;
                }

                let cities = await fetchCityDetails(cityCountryIds);

                await addLocationData(cities, 'state');
                await addLocationData(cities, 'country');

                cities = filterCitiesByParsedCriteria(cities, parsed);

                results_arr.push(cities);
            }

            // Remove duplicates
            let cityIdDict = {};
            let results = [];

            for (let i = 0; i < results_arr.length; i++) {
                let arr = results_arr[i];

                for (let city of arr) {
                    if (!(city.id in cityIdDict)) {
                        cityIdDict[city.id] = true;
                        results.push(city);
                    }
                }
            }

            results = results
                .map((city) =>
                    calculateCityScore(city, userLat, userLon, maxDistance, locationCountry),
                )
                .filter(Boolean)
                .sort((a, b) => b.score - a.score)
                .slice(0, LIMIT);

            resolve(results);
        } catch (e) {
            console.error('Error in cityAutoComplete:', e);
            reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    countryPrefixLimit: MAX_COUNTRY_PREFIX_LIMIT,
    countries,
    cityAutoComplete,
};
