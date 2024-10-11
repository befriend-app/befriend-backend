// https://www.geoapify.com/data-share/localities/

const axios = require('axios');
const AdmZip = require('adm-zip');

const {loadScriptEnv, joinPaths, timeNow} = require("../../services/shared");
const dbService = require("../../services/db");

loadScriptEnv();

const link_prefix = `https://www.geoapify.com/data-share/localities/`;

let countries_dict = {};
let countries_id_dict = {};
let states_dict = {};
let states_id_dict = {};
let cities_dict = {};


function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Add cities, states, and populations");

            let t = timeNow();

            let conn = await dbService.conn();

            let countries = await conn('open_countries')
                .where('id', '>', 0);

            for(let country of countries) {
                countries_dict[country.country_code] = country;
                countries_id_dict[country.id] = country;
            }

            let states = await conn('open_states AS os')
                .leftJoin('open_countries AS oc', 'os.country_id', '=', 'oc.id')
                .select('os.*', 'oc.country_code');

            for(let state of states) {
                if(!(state.country_code in states_dict)) {
                    states_dict[state.country_code] = {};
                }

                states_dict[state.country_code][state.state_short] = state;

                states_id_dict[state.id] = state;
            }

            let cities = await conn('open_cities');

            for(let city of cities) {
                if(!(city.country_id in cities_dict)) {
                    cities_dict[city.country_id] = {};
                }

                if(!(city.state_id in cities_dict[city.country_id])) {
                    cities_dict[city.country_id][city.state_id] = {};
                }

                cities_dict[city.country_id][city.state_id][city.city_name.toLowerCase()] = city;
            }

            for(let country of countries) {
                let r;

                console.log({
                    id: country.id,
                    country: country.country_name
                });

                let url = joinPaths(link_prefix, country.country_code.toLowerCase() + '.zip');

                try {
                    r = await axios({
                        method: 'get',
                        url: url,
                        responseType: 'arraybuffer'
                    });
                } catch(e) { //404
                    continue;
                }

                const zip = new AdmZip(r.data);

                const entries = zip.getEntries();

                for(let entry of entries) {
                    // Get file name
                    // console.log('File:', entry.entryName);

                    // Get file content as text
                    const content = entry.getData().toString('utf8');

                    if(!content) {
                        continue;
                    }

                    const lines = content.split('\n');

                    let batch_insert = [];

                    for(let line of lines) {
                        let data = JSON.parse(line);

                        if(!data.name) {
                            continue;
                        }

                        //skip administrative
                        if(data.type === 'administrative') {
                            continue;
                        }

                        let name = data.name;

                        if('other_names' in data) {
                            if('name:en' in data.other_names) {
                                name = data.other_names['name:en'];
                            } else if('int_name' in data.other_names) {
                                name = data.other_names['int_name'];
                            }
                        }

                        let state, state_short;

                        let population = null;

                        if('state' in data.address) {
                            state = data.address.state;

                            try {
                                if('ISO3166-2-lvl4' in data.address) {
                                    state_short = data.address["ISO3166-2-lvl4"].split('-')[1];
                                } else if('ISO3166-2-lvl5' in data.address) {
                                    state_short = data.address["ISO3166-2-lvl5"].split('-')[1];
                                } else if('ISO3166-2-lvl6' in data.address) {
                                    state_short = data.address["ISO3166-2-lvl6"].split('-')[0];
                                } else {
                                    state_short = data.address.state;
                                }
                            } catch(e) {
                                debugger;
                            }

                            population = data.population;
                        } else if('municipality' in data.address) {
                            state = data.address.municipality;
                            state_short = state;
                        } else {
                            continue;
                        }

                        if(!(country.country_code in states_dict)) {
                            states_dict[country.country_code] = {};
                        }

                        let state_db = states_dict[country.country_code][state_short];

                        if(!state_db) {
                            let id = await conn('open_states')
                                .insert({
                                    country_id: country.id,
                                    state_name: state,
                                    state_short: state_short,
                                });

                            state_db = states_dict[country.country_code][state_short] = {
                                id: id[0]
                            }

                            if(!(country.id in cities_dict)) {
                                cities_dict[country.id] = {};
                            }
                        }

                        if(!(country.id in cities_dict)) {
                            cities_dict[country.id] = {};
                        }

                        if(!(state_db.id in cities_dict[country.id])) {
                            cities_dict[country.id][state_db.id] = {};
                        }

                        if(name.toLowerCase() in cities_dict[country.id][state_db.id]) {
                            continue;
                        }

                        let insert_data = {
                            country_id: country.id,
                            state_id: state_db.id,
                            city_name: name,
                            population: population,
                            lat: data.location[1],
                            lon: data.location[0],
                            postcode: data.address.postcode,
                            is_city: data.type === 'city',
                            is_town: data.type === 'town',
                            is_village: data.type === 'village',
                            is_hamlet: data.type === 'hamlet',
                            is_administrative: data.type === 'administrative'
                        };

                        //prevent duplicate cities in same state
                        cities_dict[country.id][state_db.id][name.toLowerCase()] = insert_data;

                        batch_insert.push(insert_data);

                        if(batch_insert.length > 5000) {
                            await dbService.batchInsert(conn, 'open_cities', batch_insert);
                            batch_insert = [];
                        }
                    }

                    if(batch_insert.length) {
                        await dbService.batchInsert(conn, 'open_cities', batch_insert);
                    }
                }
            }

            console.log({
                time: ((timeNow() - t) / 1000).toFixed(1) + ' sec'
            });
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main: main
}

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