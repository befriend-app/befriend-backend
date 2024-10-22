const axios = require('axios');
const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

loadScriptEnv();

function indexCities() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            console.log('Cities');

            let countries = await conn('open_countries');

            let countries_dict = {};

            countries.map((country) => {
                countries_dict[country.id] = country;
            });

            let cities = await conn('open_cities').whereNotNull('population');

            let pipeline = cacheService.conn.multi();

            for (let int = 0; int < cities.length; int++) {
                if (int % 1000 === 0) {
                    console.log({
                        loop: int,
                    });
                }

                let city = cities[int];

                const city_key = `${cacheService.keys.city}${city.id}`;

                pipeline.hSet(city_key, {
                    id: city.id,
                    name: city.city_name,
                    country_id: city.country_id,
                    state_id: city.state_id ? city.state_id : '',
                    population: city.population,
                    lat: city.lat,
                    lon: city.lon,
                });

                try {
                    pipeline.zAdd(cacheService.keys.cities_population, [
                        {
                            value: city.id.toString(),
                            score: city.population,
                        },
                    ]);
                } catch (e) {
                    console.error(e);
                }

                //add to country set
                let country_code = countries_dict[city.country_id].country_code;

                pipeline.zAdd(`${cacheService.keys.cities_country}${country_code}`, [
                    {
                        value: city.id.toString(),
                        score: city.population,
                    },
                ]);

                //from beginning of name to end
                const nameLower = city.city_name.toLowerCase();

                for (let i = 1; i <= nameLower.length; i++) {
                    const prefix = nameLower.slice(0, i);

                    pipeline.zAdd(`${cacheService.keys.cities_prefix}${prefix}`, [
                        {
                            value: city.id.toString(),
                            score: city.population,
                        },
                    ]);
                }

                //split name into words
                const nameSplit = nameLower.split(' ');

                for (let word of nameSplit) {
                    for (let i = 1; i <= word.length; i++) {
                        const prefix = word.slice(0, i);

                        pipeline.zAdd(`${cacheService.keys.cities_prefix}${prefix}`, [
                            {
                                value: city.id.toString(),
                                score: city.population,
                            },
                        ]);

                        //add to country prefix for small number of characters
                        if (i < 4) {
                            pipeline.zAdd(
                                cacheService.keys.multi.cityCountryPrefix(country_code, prefix),
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

                if (int % 5000 === 0) {
                    await pipeline.execAsPipeline();

                    pipeline = cacheService.conn.multi();
                }
            }

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
            console.log('States');

            let conn = await dbService.conn();

            let states = await conn('open_states');

            let pipeline = cacheService.conn.multi();

            for (let state of states) {
                const state_key = `${cacheService.keys.state}${state.id}`;

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
            console.log('Countries');

            let conn = await dbService.conn();

            let pipeline = cacheService.conn.multi();

            let countries = await conn('open_countries');

            for (let country of countries) {
                const country_key = `${cacheService.keys.country}${country.id}`;

                pipeline.hSet(country_key, {
                    id: country.id,
                    name: country.country_name,
                    code: country.country_code,
                    population: country.population ? country.population : '',
                    lat: country.lat,
                    lon: country.lon,
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

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Indexing Locations');

            await cacheService.init();

            await indexCities();
            await indexStates();
            await indexCountries();
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
