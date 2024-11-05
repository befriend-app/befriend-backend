const axios = require('axios');
const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

loadScriptEnv();

const batchSize = 5000;

let countries_dict = {};

function indexSchools() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let schools = await conn('schools').whereNull('deleted');

            let pipeline = cacheService.conn.multi();

            for (let int = 0; int < schools.length; int++) {
                if (int % 1000 === 0) {
                    console.log({
                        loop: int,
                    });
                }

                let school = schools[int];

                const school_key = cacheService.keys.school(school.token);

                pipeline.hSet(school_key, {
                    id: school.id,
                    token: school.token,
                    name: school.name,
                    city: school.city,
                    state: school.state,
                    country_id: school.country_id,
                    lat: school.lat,
                    lon: school.lon,
                    is_grade_school: school.is_grade_school,
                    is_high_school: school.is_high_school,
                    is_college: school.is_college,
                });

                //lookup token by id
                pipeline.set(school.id, school.token);

                //add to country set
                let country_code = countries_dict[school.country_id].country_code;

                //from beginning of name to end
                const nameLower = school.name.toLowerCase();

                let priority = 0;

                if(school.is_college) {
                    priority = 3;
                } else if(school.is_high_school) {
                    priority = 2;
                } else if(school.is_grade_school) {
                    priority = 1;
                }

                if(school.city) {
                    priority += 1;
                }

                for (let i = 1; i <= nameLower.length; i++) {
                    const prefix = nameLower.slice(0, i);

                    pipeline.zAdd(cacheService.keys.schools_country_prefix(country_code, prefix), [
                        {
                            value: school.id.toString(),
                            score: priority,
                        },
                    ]);
                }

                //split name into words
                const nameSplit = nameLower.split(' ');

                for (let word of nameSplit) {

                    for (let i = 1; i <= word.length; i++) {
                        const prefix = word.slice(0, i);

                        pipeline.zAdd(cacheService.keys.schools_country_prefix(country_code, prefix), [
                            {
                                value: school.id.toString(),
                                score: priority,
                            },
                        ]);
                    }
                }

                if (int % batchSize === 0) {
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

function deDuplicate() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let schools = await conn('schools').whereNull('deleted');

            let dict = {};

            let all_countries_dict = {};

            for(let s of schools) {
                if(!(s.name in all_countries_dict)) {
                    all_countries_dict[s.name] = {
                        name: s.name,
                        count: 0
                    };
                }

                all_countries_dict[s.name].count += 1;

                if(!(s.country_id in dict)) {
                    dict[s.country_id] = {};
                }

                if(!(s.name in dict[s.country_id])) {
                    dict[s.country_id][s.name] = [];
                }

                dict[s.country_id][s.name].push(s);
            }

            // let duplicate_names = [];
            //
            // for(let k in dict) {
            //     let country_names = dict[k];
            //
            //     for(let name in country_names) {
            //         let nameList = country_names[name];
            //
            //         if(nameList.length > 1) {
            //             duplicate_names.push({
            //                 country_id: k,
            //                 name: name,
            //                 count: nameList.length,
            //                 list: nameList
            //             });
            //         }
            //     }
            // }
            //
            // duplicate_names.sort((a, b) => {
            //     return b.count - a.count;
            // });

            let all_duplicates = [];

            for(let name in all_countries_dict) {
                if(all_countries_dict[name].count > 1) {
                    all_duplicates.push(all_countries_dict[name]);
                }
            }

            all_duplicates.sort((a, b) => {
                return b.count - a.count;
            });

            while (all_duplicates.length) {
                let items = all_duplicates.splice(0, 100);

                items = items.map(item => item.name);
            }

            console.log();
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function getCountries() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let countries = await conn('open_countries');

            countries.map((country) => {
                countries_dict[country.id] = country;
            });
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Indexing Schools');

            await cacheService.init();

            await getCountries();

            await deDuplicate();
            await indexSchools();
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