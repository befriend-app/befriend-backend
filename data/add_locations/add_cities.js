// https://www.geoapify.com/data-share/localities/
// https://public.opendatasoft.com/explore/dataset/geonames-all-cities-with-a-population-500

const axios = require('axios');
const AdmZip = require('adm-zip');

const {
    loadScriptEnv,
    joinPaths,
    timeNow,
    getDistanceMeters,
    getMetersFromMilesOrKm,
} = require('../../services/shared');
const dbService = require('../../services/db');

loadScriptEnv();

const link_prefix = `https://www.geoapify.com/data-share/localities/`;

const cities_population_link = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-500/exports/json`;

let countries_dict = {};
let countries_id_dict = {};
let states_dict = {};
let states_id_dict = {};
let cities_dict = {};

let populations_dict = {};

function fetchCityPopulations() {
    return new Promise(async (resolve, reject) => {
        console.log('Download cities with a population > 500');

        try {
            let r = await axios.get(cities_population_link);

            for (let city of r.data) {
                if (!city.population) {
                    continue;
                }

                if (!(city.country_code in populations_dict)) {
                    populations_dict[city.country_code] = {};
                }

                let city_name_lower = city.name.toLowerCase();

                if (!(city_name_lower in populations_dict[city.country_code])) {
                    populations_dict[city.country_code][city_name_lower] = [];
                }

                populations_dict[city.country_code][city_name_lower].push({
                    name: city.name,
                    population: city.population,
                    coordinates: city.coordinates,
                });
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function findPopulation(city) {
    if (city.address && city.address.country_code.toUpperCase() in populations_dict) {
        let country_data = populations_dict[city.address.country_code.toUpperCase()];

        let city_name_lower = getCityName(city).toLowerCase();

        if (city_name_lower in country_data) {
            let cities = country_data[city_name_lower];

            for (let _city of cities) {
                let distance = getDistanceMeters(
                    {
                        lat: city.location[1],
                        lon: city.location[0],
                    },
                    _city.coordinates,
                );

                if (distance < getMetersFromMilesOrKm(30)) {
                    if (_city.population) {
                        return _city.population;
                    }
                }
            }
        }
    }

    return null;
}

function getCityName(city) {
    let name = city.name;

    if ('other_names' in city) {
        if ('name:en' in city.other_names) {
            name = city.other_names['name:en'];
        } else if ('int_name' in city.other_names) {
            name = city.other_names['int_name'];
        }
    }

    return name;
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Add cities, states, and populations');

            let t = timeNow();

            await fetchCityPopulations();

            let conn = await dbService.conn();

            let countries = await conn('open_countries').where('id', '>', 0);

            for (let country of countries) {
                countries_dict[country.country_code] = country;
                countries_id_dict[country.id] = country;
            }

            let states = await conn('open_states AS os')
                .leftJoin('open_countries AS oc', 'os.country_id', '=', 'oc.id')
                .select('os.*', 'oc.country_code');

            for (let state of states) {
                if (!(state.country_code in states_dict)) {
                    states_dict[state.country_code] = {};
                }

                states_dict[state.country_code][state.state_short] = state;

                states_id_dict[state.id] = state;
            }

            let cities = await conn('open_cities');

            for (let city of cities) {
                if (!(city.country_id in cities_dict)) {
                    cities_dict[city.country_id] = {};
                }

                if (!(city.state_id in cities_dict[city.country_id])) {
                    cities_dict[city.country_id][city.state_id] = {};
                }

                cities_dict[city.country_id][city.state_id][city.city_name.toLowerCase()] = city;
            }

            console.log('Process countries');

            for (let country of countries) {
                let r;

                console.log({
                    id: country.id,
                    country: country.country_name,
                });

                let url = joinPaths(link_prefix, country.country_code.toLowerCase() + '.zip');

                try {
                    r = await axios({
                        method: 'get',
                        url: url,
                        responseType: 'arraybuffer',
                    });
                } catch (e) {
                    //404
                    continue;
                }

                const zip = new AdmZip(r.data);

                const entries = zip.getEntries();

                for (let entry of entries) {
                    // Get file name
                    // console.log('File:', entry.entryName);

                    // Get file content as text
                    const content = entry.getData().toString('utf8');

                    if (!content) {
                        continue;
                    }

                    const lines = content.split('\n');

                    let batch_insert = [];

                    for (let line of lines) {
                        let city;

                        try {
                            city = JSON.parse(line);
                        } catch(e) {
                            console.error(e);
                            continue;
                        }

                        if (!city.name) {
                            continue;
                        }

                        //skip administrative
                        if (city.type === 'administrative') {
                            continue;
                        }

                        let name = getCityName(city);

                        let state = null,
                            state_short = null;

                        let population = city.population;

                        if ('state' in city.address) {
                            state = city.address.state;

                            try {
                                if ('ISO3166-2-lvl4' in city.address) {
                                    state_short = city.address['ISO3166-2-lvl4'].split('-')[1];
                                } else if ('ISO3166-2-lvl5' in city.address) {
                                    state_short = city.address['ISO3166-2-lvl5'].split('-')[1];
                                } else if ('ISO3166-2-lvl6' in city.address) {
                                    state_short = city.address['ISO3166-2-lvl6'].split('-')[0];
                                } else {
                                    state_short = city.address.state;
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        } else if ('municipality' in city.address) {
                            state = city.address.municipality;
                            state_short = state;
                        } else if (city.type !== 'city') {
                            continue;
                        }

                        if (!(country.country_code in states_dict)) {
                            states_dict[country.country_code] = {};
                        }

                        let state_db = states_dict[country.country_code][state_short];

                        if (!state_db && state) {
                            let id = await conn('open_states').insert({
                                country_id: country.id,
                                state_name: state,
                                state_short: state_short,
                            });

                            state_db = states_dict[country.country_code][state_short] = {
                                id: id[0],
                            };

                            if (!(country.id in cities_dict)) {
                                cities_dict[country.id] = {};
                            }
                        }

                        if (!(country.id in cities_dict)) {
                            cities_dict[country.id] = {};
                        }

                        if (state) {
                            if (!(state_db.id in cities_dict[country.id])) {
                                cities_dict[country.id][state_db.id] = {};
                            }

                            if (name.toLowerCase() in cities_dict[country.id][state_db.id]) {
                                continue;
                            }
                        }

                        if (!population) {
                            population = findPopulation(city);
                        }

                        let lat_min = Math.min(city.bbox[1], city.bbox[3]);
                        let lat_max = Math.max(city.bbox[1], city.bbox[3]);
                        let lon_min = Math.min(city.bbox[0], city.bbox[2]);
                        let lon_max = Math.max(city.bbox[0], city.bbox[2]);
                        let lat_min_1000 = Math.floor(lat_min * 1000);
                        let lat_max_1000 = Math.floor(lat_max * 1000);
                        let lon_min_1000 = Math.floor(lon_min * 1000);
                        let lon_max_1000 = Math.floor(lon_max * 1000);

                        let insert_data = {
                            country_id: country.id,
                            state_id: state_db ? state_db.id : null,
                            city_name: name,
                            population: population,
                            lat: city.location[1],
                            lon: city.location[0],
                            postcode: city.address.postcode,
                            is_city: city.type === 'city',
                            is_town: city.type === 'town',
                            is_village: city.type === 'village',
                            is_hamlet: city.type === 'hamlet',
                            is_administrative: city.type === 'administrative',
                            bbox_lat_min: lat_min,
                            bbox_lat_max: lat_max,
                            bbox_lon_min: lon_min,
                            bbox_lon_max: lon_max,
                            bbox_lat_min_1000: lat_min_1000,
                            bbox_lat_max_1000: lat_max_1000,
                            bbox_lon_min_1000: lon_min_1000,
                            bbox_lon_max_1000: lon_max_1000,
                        };

                        //prevent duplicate cities in same state
                        if (state_db) {
                            cities_dict[country.id][state_db.id][name.toLowerCase()] = insert_data;
                        }

                        batch_insert.push(insert_data);

                        if (batch_insert.length > 5000) {
                            await dbService.batchInsert('open_cities', batch_insert);
                            batch_insert = [];
                        }
                    }

                    if (batch_insert.length) {
                        await dbService.batchInsert('open_cities', batch_insert);
                    }
                }
            }

            console.log({
                time: ((timeNow() - t) / 1000).toFixed(1) + ' sec',
            });
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main: main,
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
