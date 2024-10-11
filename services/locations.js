const cacheService = require('../services/cache');
const {getDistanceMeters, timeNow} = require("./shared");


function cityAutoComplete(search, userLat, userLon, maxDistance) {
    return new Promise(async (resolve, reject) => {
        let limit = 10;

        if(userLat) {
            userLat = parseFloat(userLat);
        }

        if(userLon) {
            userLon = parseFloat(userLon);
        }

        search = search.toLowerCase();

        try {
             let key = `${cacheService.keys.cities_prefix}${search}`;

             let city_ids = await cacheService.getSortedSet(key);

             if(!city_ids.length) {
                 return resolve([]);
             }

            // Get city details and calculate scores
            const pipeline = cacheService.conn.multi();

             for(let id of city_ids) {
                 pipeline.hGetAll(`${cacheService.keys.city}${id}`);
             }

             let cities = await cacheService.execRedisMulti(pipeline);

            const results = cities
                .map(function (city) {
                    if (!city) return null;

                    // Convert types
                    city.population = parseInt(city.population);
                    city.lat = parseFloat(city.lat);
                    city.lon = parseFloat(city.lon);

                    // Calculate distance if coordinates provided
                    let distance = null;

                    if (userLat != null && userLon != null) {
                        distance = getDistanceMeters({
                                lat: userLat,
                                lon: userLon
                            }, {
                                lat: city.lat,
                                lon: city.lon
                            }
                        );

                        // Skip if beyond maxDistance
                        if (maxDistance && distance > maxDistance) {
                            return null;
                        }
                    }

                    // Calculate combined score
                    const populationScore = city.population / 500000; // Normalize to 500k
                    let score;

                    if (distance != null) {
                        const distanceScore = (1000 * 1000) / (distance + 1);
                        score = (populationScore + distanceScore) / 2;
                    } else {
                        score = populationScore;
                    }

                    return {
                        ...city,
                        distance,
                        score
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);

            return resolve(results);
        } catch(e) {
            console.error(e);
            return reject();
        }
    });
}

module.exports = {
    cityAutoComplete: cityAutoComplete
}