const { normalizeSearch, timeNow, getDistanceMeters } = require('./shared');
const cacheService = require('./cache');
const { getCitiesByCountry, getStates } = require('./locations');
const RESULTS_LIMIT = 50;
const MAX_PREFIX_LIMIT = 3;

const schoolTypes = {
    is_college: 'college',
    is_high_school: 'hs',
    is_grade_school: 'grade',
};

const TYPE_SCORES = {
    college: 1.0,
    hs: 0.8,
    grade: 0.6,
    '': 0.4,
};

function scoreSchools(schools, location) {
    const DISTANCE_WEIGHT = 0.4;
    const SIZE_WEIGHT = 0.3;
    const TYPE_WEIGHT = 0.3;

    const BASE_DISTANCE = 10000;
    const MAX_DISTANCE = 1000000;

    function calculateDistanceScore(distance) {
        if (!distance || distance < 0) return 1;
        if (distance < BASE_DISTANCE) return 1;

        const score =
            1 -
            (Math.log(distance) - Math.log(BASE_DISTANCE)) /
                (Math.log(MAX_DISTANCE) - Math.log(BASE_DISTANCE));

        return Math.max(0, Math.min(1, score));
    }

    function calculateSizeScore(sc) {
        if (!sc || sc < 0) return 0;

        // Normalize size score logarithmically
        // This prevents very large schools from completely dominating
        const normalizedSize = Math.log10(sc + 1) / Math.log10(50000);
        return Math.min(1, Math.max(0, normalizedSize));
    }

    function calculateTypeScore(type) {
        return TYPE_SCORES[type] || TYPE_SCORES[''];
    }

    function scoreResults(results, userLat, userLon) {
        if (!userLat || !userLon) {
            return results;
        }

        return results
            .map((school) => {
                const distance = getDistanceMeters(
                    {
                        lat: userLat,
                        lon: userLon,
                    },
                    {
                        lat: school.lat,
                        lon: school.lon,
                    },
                );

                const distanceScore = calculateDistanceScore(distance);

                // Calculate size score
                const sizeScore = calculateSizeScore(school.sc);

                // Calculate type score
                const typeScore = calculateTypeScore(school.type);

                // Calculate final weighted score
                const finalScore =
                    distanceScore * DISTANCE_WEIGHT +
                    sizeScore * SIZE_WEIGHT +
                    typeScore * TYPE_WEIGHT;

                return {
                    ...school,
                    distance,
                    relevanceScore: finalScore,
                    _scores: {
                        distance: distanceScore,
                        size: sizeScore,
                        type: typeScore,
                    },
                };
            })
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // Parse coordinates as floats
    const lat = location ? parseFloat(location.lat) : null;
    const lon = location ? parseFloat(location.lon) : null;

    if (isNaN(lat) || isNaN(lon)) {
        // If no valid coordinates, return results sorted by size/type
        return schools.sort((a, b) => {
            const aScore =
                calculateSizeScore(a.sc) * SIZE_WEIGHT + calculateTypeScore(a.type) * TYPE_WEIGHT;
            const bScore =
                calculateSizeScore(b.sc) * SIZE_WEIGHT + calculateTypeScore(b.type) * TYPE_WEIGHT;
            return bScore - aScore;
        });
    }

    // Score and sort results
    const scoredResults = scoreResults(schools, lat, lon);

    // Add formatted distance
    return scoredResults.map((result) => ({
        ...result,
        distanceFormatted: result.distance
            ? `${(result.distance / 1000).toFixed(1)}km`
            : 'Unknown distance',
    }));
}

function schoolAutoComplete(country_id, search_term, user_location) {
    return new Promise(async (resolve, reject) => {
        let country;

        search_term = normalizeSearch(search_term);

        let prefix = search_term.substring(0, MAX_PREFIX_LIMIT);

        //get country obj by id
        try {
            country = await cacheService.hGetAll(cacheService.keys.country(country_id));

            if (!country) {
                return reject('Country not found');
            }
        } catch (e) {
            return reject('Country not found');
        }

        let prefix_key = cacheService.keys.schools_country_prefix(country.code, prefix);

        try {
            let tokens = await cacheService.getSetMembers(prefix_key);

            let pipeline = await cacheService.startPipeline();

            for (let token of tokens) {
                pipeline.hGet(cacheService.keys.schools_country(country.code), token);
            }

            let items = await cacheService.execMulti(pipeline);

            for (let i = 0; i < items.length; i++) {
                try {
                    items[i] = JSON.parse(items[i]);
                } catch (e) {
                    console.error(e);
                }
            }

            if (search_term.length > MAX_PREFIX_LIMIT) {
                items = items.filter(function (item) {
                    return item.name.toLowerCase().includes(search_term);
                });
            }

            if (!items.length) {
                return resolve({});
            }

            let sorted = scoreSchools(items, user_location);

            //group by type
            let schoolGroups = {
                grade: [],
                hs: [],
                college: [],
                other: [],
            };

            //add city/state
            //prepare city ids
            let city_ids = {};

            for (let school of sorted) {
                if (school.type === schoolTypes.is_college) {
                    if (schoolGroups.college.length < RESULTS_LIMIT) {
                        schoolGroups.college.push(school);

                        city_ids[school.city_id] = 1;
                    }
                } else if (school.type === schoolTypes.is_high_school) {
                    if (schoolGroups.hs.length < RESULTS_LIMIT) {
                        schoolGroups.hs.push(school);

                        city_ids[school.city_id] = 1;
                    }
                } else if (school.type === schoolTypes.is_grade_school) {
                    if (schoolGroups.grade.length < RESULTS_LIMIT) {
                        schoolGroups.grade.push(school);

                        city_ids[school.city_id] = 1;
                    }
                } else {
                    if (schoolGroups.other.length < RESULTS_LIMIT) {
                        schoolGroups.other.push(school);

                        city_ids[school.city_id] = 1;
                    }
                }
            }

            let cities = await getCitiesByCountry(country.code, Object.keys(city_ids));

            let cities_lookup = cities.reduce((acc, city) => {
                acc[city.id] = city;
                return acc;
            }, {});

            let states_lookup = {};

            //get states (us only for now)
            if (country.code === 'US') {
                let stateIds = cities.reduce((acc, city) => {
                    if (city.state_id) {
                        acc[city.state_id] = 1;
                    }

                    return acc;
                }, {});

                let states = await getStates(Object.keys(stateIds));

                states_lookup = states.reduce((acc, state) => {
                    acc[state.id] = state;

                    return acc;
                }, {});
            }

            for (let schoolType in schoolGroups) {
                let schools = schoolGroups[schoolType];

                for (let school of schools) {
                    let city = cities_lookup[school.city_id];

                    if (city) {
                        school.city = city.name;

                        let state = states_lookup[city.state_id];

                        if (state) {
                            school.state = state.short;
                        }
                    }
                }
            }

            resolve(schoolGroups);
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    typeNames: schoolTypes,
    prefixLimit: MAX_PREFIX_LIMIT,
    schoolAutoComplete,
};
