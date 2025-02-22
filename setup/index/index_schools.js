const { loadScriptEnv } = require('../../services/shared');
const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const schoolService = require('../../services/schools');

loadScriptEnv();

const BATCH_SIZE = 5000;

function indexSchools() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            // Get countries once
            let countries = await conn('open_countries');
            let countries_dict = {};

            countries.map((country) => {
                countries_dict[country.id] = country;
            });

            let schools = await conn('schools').whereNotNull('name');

            // Group schools by country
            const schoolsByCountry = {};
            const prefixGroups = {};
            const deletePrefixGroups = {};

            for (let school of schools) {
                const country_code = countries_dict[school.country_id].country_code;

                if (!schoolsByCountry[country_code]) {
                    schoolsByCountry[country_code] = {};
                }

                schoolsByCountry[country_code][school.token] = JSON.stringify({
                    id: school.id,
                    code: country_code,
                    token: school.token,
                    name: school.name,
                    city_id: school.city_id || '',
                    lat: school.lat || '',
                    lon: school.lon || '',
                    sc: school.student_count,
                    type: school.is_college
                        ? schoolService.typeNames.is_college
                        : school.is_high_school
                          ? schoolService.typeNames.is_high_school
                          : school.is_grade_school
                            ? schoolService.typeNames.is_grade_school
                            : '',
                    d: school.deleted ? 1 : '',
                });

                // Index prefixes
                const nameLower = school.name.toLowerCase();
                const words = nameLower.split(/\s+/);
                let delete_multi = cacheService.startPipeline();

                // Index start of full name
                for (let i = 1; i <= Math.min(nameLower.length, schoolService.prefixLimit); i++) {
                    const prefix = nameLower.slice(0, i);

                    if (!prefixGroups[country_code]) {
                        prefixGroups[country_code] = {};
                    }

                    if (!deletePrefixGroups[country_code]) {
                        deletePrefixGroups[country_code] = {};
                    }

                    if (!prefixGroups[country_code][prefix]) {
                        prefixGroups[country_code][prefix] = [];
                    }

                    if (school.deleted) {
                        if (!deletePrefixGroups[country_code][prefix]) {
                            deletePrefixGroups[country_code][prefix] = [];
                        }

                        deletePrefixGroups[country_code][prefix].push(school.token);
                    } else {
                        prefixGroups[country_code][prefix].push(school.token);
                    }
                }

                // Index word prefixes
                for (let word of words) {
                    if (word.length < 2) continue; // Skip very short words

                    for (let i = 1; i <= Math.min(word.length, schoolService.prefixLimit); i++) {
                        const prefix = word.slice(0, i);

                        if (!prefixGroups[country_code]) {
                            prefixGroups[country_code] = {};
                        }

                        if (!deletePrefixGroups[country_code]) {
                            deletePrefixGroups[country_code] = {};
                        }

                        if (!prefixGroups[country_code][prefix]) {
                            prefixGroups[country_code][prefix] = [];
                        }

                        if (school.deleted) {
                            if (!deletePrefixGroups[country_code][prefix]) {
                                deletePrefixGroups[country_code][prefix] = [];
                            }

                            deletePrefixGroups[country_code][prefix].push(school.token);
                        } else {
                            prefixGroups[country_code][prefix].push(school.token);
                        }
                    }
                }
            }

            // Add to Redis
            let count = 0;
            let pipeline = cacheService.startPipeline();

            // Store schools, by country
            for (const [countryCode, schools] of Object.entries(schoolsByCountry)) {
                pipeline.hSet(cacheService.keys.schools_country(countryCode), schools);
                count++;

                if (count % BATCH_SIZE === 0) {
                    await pipeline.execAsPipeline();
                    pipeline = cacheService.startPipeline();
                }
            }

            // Store prefixes, by country
            for (const [countryCode, prefixes] of Object.entries(prefixGroups)) {
                for (const [prefix, schools] of Object.entries(prefixes)) {
                    pipeline.sAdd(
                        cacheService.keys.schools_country_prefix(countryCode, prefix),
                        schools,
                    );

                    count++;

                    if (count % BATCH_SIZE === 0) {
                        await pipeline.execAsPipeline();
                        pipeline = cacheService.startPipeline();
                    }
                }
            }

            // Delete deleted schools from prefix set
            for (const [countryCode, prefixes] of Object.entries(deletePrefixGroups)) {
                for (const [prefix, schools] of Object.entries(prefixes)) {
                    pipeline.sRem(
                        cacheService.keys.schools_country_prefix(countryCode, prefix),
                        schools,
                    );

                    count++;

                    if (count % BATCH_SIZE === 0) {
                        await pipeline.execAsPipeline();
                        pipeline = cacheService.startPipeline();
                    }
                }
            }

            if (count % BATCH_SIZE !== 0) {
                await pipeline.execAsPipeline();
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        resolve();
    });
}

module.exports = {
    main: async function (is_me) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('Index Schools');
                await cacheService.init();
                await indexSchools();

                console.log('Index completed');
                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    },
};

if (require.main === module) {
    (async function () {
        await module.exports.main(true);
        process.exit();
    })();
}
