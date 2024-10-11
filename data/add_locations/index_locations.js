const axios = require('axios');
const {loadScriptEnv} = require("../../services/shared");
const cacheService = require("../../services/cache");
const dbService = require("../../services/db");

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Indexing Cities");

            await cacheService.init();

            let conn = await dbService.conn();

            let cities = await conn('open_cities')
                .whereNotNull('population');

            let pipeline = cacheService.conn.multi();

            for(let int = 0; int < cities.length; int++) {
                if(int % 1000 === 0) {
                    console.log({
                        loop: int
                    });
                }

                let city = cities[int];

                const city_key = `${cacheService.keys.city}${city.id}`;

                pipeline.hSet(city_key, {
                    id: city.id,
                    name: city.city_name,
                    country_id: city.country_id,
                    state_id: city.state_id,
                    population: city.population,
                    lat: city.lat,
                    lon: city.lon
                });

                try {
                    pipeline.zAdd(cacheService.keys.cities_population, [{
                        value: city.id.toString(),
                        score: city.population
                    }]);
                } catch(e) {
                    debugger;
                }

                const nameLower = city.city_name.toLowerCase();

                for (let i = 1; i <= nameLower.length; i++) {
                    const prefix = nameLower.slice(0, i);

                    pipeline.zAdd(`${cacheService.keys.cities_prefix}${prefix}`, [{
                        value: city.id.toString(),
                        score: city.population
                    }]);
                }

                if(int % 5000 === 0) {
                    await pipeline.execAsPipeline();

                    pipeline = cacheService.conn.multi();
                }
            }

            await pipeline.execAsPipeline();
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