const cacheService = require('./cache');
const dbService = require('./db');

module.exports = {
    importance: {
        default: 8,
    },
    data: {},
    languages: null,
    getLanguages: function () {
        return new Promise(async (resolve, reject) => {
            try {
                if (module.exports.data.languages) {
                    return resolve(module.exports.languages);
                }

                const cache_key = cacheService.keys.languages;

                let options = await cacheService.getObj(cache_key);

                if (!options) {
                    const conn = await dbService.conn();

                    options = await conn('languages')
                        .whereNull('deleted')
                        .where('is_visible', true)
                        .select('id', 'token', 'name');

                    await cacheService.setCache(cache_key, options);
                }

                module.exports.languages = options;

                return resolve(options);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getLanguagesCountry: function (country_code) {
        return new Promise(async (resolve, reject) => {
            if (!country_code) {
                country_code = process.env.DEFAULT_COUNTRY_CODE || 'US';
            }

            try {
                if (module.exports.data[country_code]) {
                    return resolve(module.exports.data[country_code]);
                }

                const cache_key = cacheService.keys.languages_country(country_code);
                let options = await cacheService.getObj(cache_key);

                if (!options) {
                    const conn = await dbService.conn();

                    // Get all languages and build initial dictionary
                    let [languages, countries] = await Promise.all([
                        conn('languages')
                            .whereNull('deleted')
                            .where('is_visible', true)
                            .select('id', 'token', 'name'),
                        conn('open_countries').where('country_code', country_code).select('id'),
                    ]);

                    // Build initial dictionary with all languages
                    let languagesDict = {};
                    for (let lang of languages) {
                        languagesDict[lang.id] = {
                            id: lang.id,
                            token: lang.token,
                            name: lang.name,
                            source: 'other',
                            sort_position: lang.name.toLowerCase(), // Use name for alphabetical fallback
                        };
                    }

                    // Get and apply country-specific top languages if country exists
                    if (countries.length) {
                        let topLanguages = await conn('languages_countries_top AS lct')
                            .join('languages AS l', 'l.id', 'lct.language_id')
                            .where('lct.country_id', countries[0].id)
                            .whereNull('lct.deleted')
                            .select('l.id', 'lct.sort_position')
                            .orderBy('lct.sort_position', 'asc');

                        for (let lang of topLanguages) {
                            if (lang.id in languagesDict) {
                                languagesDict[lang.id].source = 'top';
                                languagesDict[lang.id].sort_position = lang.sort_position;
                            }
                        }
                    }

                    // After top languages
                    const commonTokens = ['english', 'spanish', 'french', 'german'];
                    let commonLangs = await conn('languages')
                        .whereIn('token', commonTokens)
                        .select('id', 'token');

                    let nextCommonPosition = 1000; // Arbitrary gap after top languages
                    for (let lang of commonLangs) {
                        if (languagesDict[lang.id].source === 'other') {
                            languagesDict[lang.id].source = 'common';
                            languagesDict[lang.id].sort_position = nextCommonPosition++;
                        }
                    }

                    // Convert to array and sort
                    options = Object.values(languagesDict)
                        .sort((a, b) => {
                            // First by source priority (top > common > other)
                            const sourcePriority = { top: 0, common: 1, other: 2 };
                            if (sourcePriority[a.source] !== sourcePriority[b.source]) {
                                return sourcePriority[a.source] - sourcePriority[b.source];
                            }

                            // Within same source type, sort by position/name
                            if (a.source === 'top') {
                                return a.sort_position - b.sort_position;
                            }
                            if (a.source === 'common') {
                                return a.sort_position - b.sort_position;
                            }
                            // Alphabetical for 'other'
                            return a.sort_position.localeCompare(b.sort_position);
                        })
                        .map(({ id, token, name }) => ({ id, token, name }));

                    await cacheService.setCache(cache_key, options);
                }

                module.exports.data[country_code] = options;

                return resolve(options);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
};
