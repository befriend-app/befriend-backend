const redis = require('redis');
const { IBM_LZ77 } = require('adm-zip/util/constants');
const { isNumeric } = require('./shared');

const standardKeys = {
    networks: 'networks',
    networks_filters: 'networks:filters',
    ws: 'ws:messages',
    activity_types: 'activity_types',
    activity_type_default: 'activity_type:default',
    countries: 'countries',
    filters: 'filters',
    me_sections: 'sections:me',
};

const filterKeys = {
    modes: 'modes',
};

const sectionKeys = {
    drinking: 'sections:drinking',
    genders: 'sections:genders',
    instruments: 'sections:instruments',
    instruments_common: 'sections:instruments:common',
    kids_ages: 'sections:kids_ages',
    languages: 'sections:languages',
    life_stages: 'sections:life_stages',
    politics: 'sections:politics',
    relationship_status: 'sections:relationship_status',
    religions: 'sections:religions',
    smoking: 'sections:smoking',
    work_industries: 'sections:work:industries',
    work_roles: 'sections:work:roles',
};

const mediaKeys = {
    movies: 'sections:movies',
    movie_genres: 'sections:movie:genres',
    movies_new: 'sections:movies:new',
    movies_popular: 'sections:movies:popular',
    music_genres: 'sections:music:genres',
    music_artists: 'sections:music:artists',
    tv_shows: 'sections:tv_shows',
    tv_genres: 'sections:tv_genres',
    tv_popular: 'sections:tv:popular',
};

const sportsKeys = {
    sports: 'sections:sports',
    sports_countries: 'sections:sports:countries',
    sports_leagues: 'sections:sports:leagues',
    sports_teams: 'sections:sports:teams',
};

const keyFunctions = {
    session: (session) => `session:api:${session}`,
    exchange_keys: (token) => `networks:keys:exchange:${token}`,

    activity: (token) => `activities:${token}`,
    activity_type: (token) => `activity_types:${token}`,
    activity_type_venue_categories: (token) => `activity_types:venue_categories:${token}`,

    place_fsq: (fsqId) => `places:fsq:${fsqId}`,
    city: (id) => `cities:${id}`,
    cities_country: (code) => `cities:countries:${code}`,
    cities_prefix: (prefix) => `cities:prefix:${prefix}`,
    state: (id) => `states:${id}`,
    country: (id) => `countries:${id}`,
    city_country_prefix: (countryCode, prefix) => `cities:country:${countryCode}:${prefix}`,

    address_geo: (addressId) => `address:geo:${addressId}`,
    travel_times: (token) => `activities:travel:${token}`,

    person: (tokenOrEmail = '') => `persons:${tokenOrEmail.toLowerCase()}`,
    person_login_tokens: (person_token = '') => `persons:${person_token.toLowerCase()}:login_tokens`,
    person_filters: (person_token) => `persons:filters:${person_token}`,
    person_sections: (person_token) => `persons:me:sections:${person_token}`,
    persons_grid_set: (gridToken, key) => `persons:grid:${gridToken}:set:${key}`,
    persons_grid_sorted: (gridToken, key) => `persons:grid:${gridToken}:sorted:${key}`,
    persons_grid_exclude: (gridToken, key) => `persons:grid:${gridToken}:exclude:${key}`,
    persons_grid_exclude_send_receive: (gridToken, key, send_or_receive) => `persons:grid:${gridToken}:exclude:${key}:${send_or_receive}`,
    persons_grid_send_receive: (gridToken, key, send_or_receive) => `persons:grid:${gridToken}:${key}:${send_or_receive}`,
    instruments_prefix: (prefix) => `instruments:prefix:${prefix}`,
    movies_prefix: (prefix) => `movies:prefix:${prefix}`,
    movies_prefix_top_1000: (prefix) => `movies:prefix:top:1000:${prefix}`,
    movies_genres_prefix: (prefix) => `movies:genres:prefix:${prefix}`,
    movies_genre_all: (token) => `movies:genres:all:${token}`,
    movies_genre_top: (token) => `movie:genres:top:movies:${token}`,
    movies_decade_all: (decade) => `movies:decade:${decade}`,
    movies_decade_top: (decade) => `movies:decade:${decade}:top`,

    music_genres_prefix: (prefix) => `music:genres:prefix:${prefix}`,
    music_artists_prefix: (prefix) => `music:artists:prefix:${prefix}`,
    music_genre_artists: (token) => `music:genres:artists:${token}`,
    music_genre_top_artists: (token) => `music:genres:top:artists:${token}`,

    schools_country: (code) => `schools:country:${code}`,
    schools_country_prefix: (code, prefix) => `schools:prefix:${code}:${prefix}`,

    languages_country: (code) => `languages:country:${code}`,

    sports_country_order: (code) => `sports:countries:top:${code}`,
    sports_country_top_leagues: (code) => `sports:countries:top:leagues:${code}`,
    sports_country_top_teams: (sportToken, code) =>
        `sports:countries:top:teams:${code}:${sportToken}`,
    sports_leagues_prefix: (prefix) => `sports:leagues:prefix:${prefix}`,
    sports_teams_prefix: (prefix) => `sports:teams:prefix:${prefix}`,

    tv_prefix: (prefix) => `tv:shows:prefix:${prefix}`,
    tv_decade_shows: (decade) => `tv:decade:${decade}:shows`,
    tv_decade_top_shows: (decade) => `tv:decade:${decade}:top`,
    tv_network_shows: (network) => `tv:network:${network}:shows`,
    tv_network_top_shows: (network) => `tv:network:${network}:top`,
    tv_genre_shows: (token) => `tv:genre:${token}:shows`,
    tv_genre_top_shows: (token) => `tv:genre:${token}:top`,
};

module.exports = {
    conn: null,
    publisher: null,
    keys: {
        ...standardKeys,
        ...filterKeys,
        ...sectionKeys,
        ...mediaKeys,
        ...sportsKeys,
        ...keyFunctions,
        sectionKeys,
        mediaKeys,
        sportsKeys,
        keyFunctions
    },
    init: function () {
        return new Promise(async (resolve, reject) => {
            let redis_ip = process.env.REDIS_HOST;

            module.exports.conn = redis.createClient({
                socket: {
                    host: `${redis_ip}`,
                },
            });

            //connect to redis server
            try {
                await module.exports.conn.connect();
            } catch (e) {
                return reject(e);
            }

            //setup publisher
            module.exports.publisher = module.exports.conn.duplicate();

            try {
                await module.exports.publisher.connect();
            } catch (e) {
                console.error(e);
            }

            module.exports.conn.on('error', function (er) {
                console.error(er.stack);
            });

            return resolve();
        });
    },
    getKeys: function (pattern) {
        return new Promise(async (resolve, reject) => {
            try {
                let keys = await module.exports.conn.keys(pattern);
                resolve(keys);
            } catch (e) {
                console.error(e);
                reject();
            }
        });
    },
    getKeysWithPrefix: function (prefix, cursor = '0', allKeys = []) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!module.exports.conn) {
                    try {
                        await module.exports.init();
                    } catch (e) {
                        return reject(e);
                    }
                }

                const result = await module.exports.conn.scan(cursor, {
                    MATCH: `${prefix}*`,
                    COUNT: 100000,
                });

                allKeys = allKeys.concat(result.keys);

                if (result.cursor === 0) {
                    return resolve(allKeys);
                }

                return resolve(
                    await module.exports.getKeysWithPrefix(prefix, result.cursor, allKeys),
                );
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    get: function (key, json) {
        return new Promise(async (resolve, reject) => {
            //init conn in case first time
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            try {
                let data = await module.exports.conn.get(key);

                if (!json) {
                    return resolve(data);
                }

                try {
                    return resolve(JSON.parse(data));
                } catch (e) {
                    return resolve(null);
                }
            } catch (e) {
                return reject(e);
            }
        });
    },
    getObj: function (key) {
        return new Promise(async (resolve, reject) => {
            //init conn in case first time
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            try {
                let data = await module.exports.conn.get(key);

                try {
                    let parsed = JSON.parse(data);
                    return resolve(parsed);
                } catch (e) {
                    return resolve(null);
                }
            } catch (e) {
                return reject(e);
            }
        });
    },
    hGetItem: function (key, item_id) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.hGet(key, item_id);

                if (typeof data === 'string') {
                    data = JSON.parse(data);
                }

                try {
                    return resolve(data);
                } catch (e) {
                    return resolve(null);
                }
            } catch (e) {
                return reject(e);
            }
        });
    },
    hGetAll: function (key) {
        return new Promise(async (resolve, reject) => {
            //init conn in case first time
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            try {
                let data = await module.exports.conn.hGetAll(key);

                try {
                    return resolve(data);
                } catch (e) {
                    return resolve(null);
                }
            } catch (e) {
                return reject(e);
            }
        });
    },
    exists: function (key) {
        return new Promise(async (resolve, reject) => {
            try {
                 let exists = await module.exports.conn.exists(key);

                 resolve(exists);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    hGetAllObj: function (key) {
        function parseData(data) {
            if(typeof data !== 'object') {
                return data;
            }

            for(let k in data) {
                let v = data[k];

                if(v === '') { //convert to null if empty string
                    data[k] = null;
                } else if (k.startsWith('is_') || ['active'].includes(k) && isNumeric(v)) { //convert to boolean
                    data[k] = !!parseInt(v);
                } else if(isNumeric(v)) { //convert back to int/float
                    if(v.includes('.')) {
                        data[k] = parseFloat(v);
                    } else {
                        data[k] = parseInt(v);
                    }
                } else if(v.startsWith('{')) { //convert to object
                    data[k] = JSON.parse(v);
                }
            }

            return data;
        }

        return new Promise(async (resolve, reject) => {
            //init conn in case first time
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            try {
                let exists = await module.exports.exists(key);

                if(!exists) {
                    return resolve(null);
                }

                let data = await module.exports.conn.hGetAll(key);

                try {
                    data = parseData(data);
                    return resolve(data);
                } catch (e) {
                    console.error(e);
                    return resolve(null);
                }
            } catch (e) {
                return reject(e);
            }
        });
    },
    hSet: function (key, field, data) {
        return new Promise(async (resolve, reject) => {
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            if(!key) {
                return reject("Key required");
            }

            if(field && typeof field !== 'string') {
                return reject("Field must be a string");
            }

            if(!data) {
                return reject("Data required");
            }

            try {
                data = structuredClone(data);

                if(field) {
                    if(typeof data === 'object') {
                        data = JSON.stringify(data);
                    } else if(typeof data !== 'string') {
                        data = data.toString();
                    }
                    await module.exports.conn.hSet(key, field, data);
                } else {
                    const processedData = {};

                    for (const [k, v] of Object.entries(data)) {
                        if (v === null) {
                            processedData[k] = '';  // Convert null to empty string
                        } else if(typeof v === 'boolean') {
                            if(v) {
                                processedData[k] = '1';
                            } else {
                                processedData[k] = '0';
                            }
                        } else if (typeof v === 'object') {
                            processedData[k] = JSON.stringify(v);

                            if (v instanceof Date) {
                                processedData[k] = processedData[k].replaceAll('"', '');
                            }
                        } else {
                            processedData[k] = v.toString();
                        }
                    }

                    await module.exports.conn.hSet(key, processedData);
                }

                resolve();
            } catch (e) {
                return reject(e);
            }
        });
    },
    setCache: function (key, data, cache_lifetime = null) {
        return new Promise(async (resolve, reject) => {
            //in case conn not initiated
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            if (typeof data !== 'string') {
                data = JSON.stringify(data);
            }

            try {
                if (cache_lifetime) {
                    await module.exports.conn.set(key, data, {
                        EX: cache_lifetime,
                    });
                } else {
                    await module.exports.conn.set(key, data);
                }
            } catch (e) {
                console.error(e);
            }

            return resolve();
        });
    },
    formatKeyName: function (key, params = []) {
        let new_key = key;

        if (params) {
            for (let param of params) {
                if (param) {
                    param = JSON.stringify(param);
                    new_key += `-${param}`;
                }
            }
        }

        return new_key.replace(/ /g, '-');
    },
    deleteKeys: function (keys, batchSize = 1000000) {
        return new Promise(async (resolve, reject) => {
            if (!module.exports.conn) {
                try {
                    await module.exports.init();
                } catch (e) {
                    return reject(e);
                }
            }

            if (typeof keys === 'string') {
                keys = [keys];
            }

            if (!keys || !keys.length) {
                return resolve();
            }

            try {
                for (let i = 0; i < keys.length; i += batchSize) {
                    const batch = keys.slice(i, i + batchSize);
                    await module.exports.conn.del(batch);
                }
                return resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    startPipeline: function () {
        return module.exports.conn.multi();
    },
    execMulti: function (multi) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await multi.exec();

                return resolve(data);
            } catch (e) {
                return reject(e);
            }
        });
    },
    execPipeline: function (pipeline) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await pipeline.execAsPipeline();

                resolve(data);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    addItemToSet(key, item) {
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof item === 'object') {
                    item = JSON.stringify(item);
                } else if (typeof item !== 'string') {
                    item = item.toString();
                }

                await module.exports.conn.sAdd(key, item);
                return resolve();
            } catch (e) {
                return reject(e);
            }
        });
    },
    addItemsToSet(key, items) {
        return new Promise(async (resolve, reject) => {
            if (!items.length) {
                return resolve();
            }

            function addToSet(key_items) {
                for (let i = 0; i < key_items.length; i++) {
                    let item = key_items[i];

                    if (typeof item !== 'string') {
                        key_items[i] = JSON.stringify(item);
                    }
                }

                return new Promise(async (resolve1, reject1) => {
                    try {
                        let data = await module.exports.conn.sAdd(key, key_items);
                        return resolve1(data);
                    } catch (err) {
                        reject1(err);
                    }
                });
            }

            let max_length = 1000000;

            let chunks = require('lodash').chunk(items, max_length);

            for (let chunk of chunks) {
                // chunk.unshift(key);

                try {
                    await addToSet(chunk);
                } catch (e) {
                    return reject(e);
                }
            }

            resolve();
        });
    },
    getSetMembers: function (key) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.sMembers(key);
                return resolve(data);
            } catch (err) {
                reject(err);
            }
        });
    },
    getSetIntersection: function (key, keys) {
        return new Promise(async (resolve, reject) => {
            try {
                 let results = await module.exports.conn.sInter(key, keys);

                 resolve(results);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getSetCount: function (key) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.sCard(key);
                resolve(data);
            } catch (e) {
                return reject(e);
            }
        });
    },
    getSetDiff: function(key, keys) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.sDiff(key, keys);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        });
    },
    isSetMember: function (key, member) {
        return new Promise(async (resolve, reject) => {
            if (!key || !member) {
                return resolve(false);
            }

            try {
                let data = await module.exports.conn.sIsMember(key, member);
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    },
    removeMemberFromSet: function (key, member) {
        return new Promise(async (resolve, reject) => {
            try {
                await module.exports.conn.sRem(key, member);
                return resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    getRedisLL: function (key) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.lLen(key);

                resolve(data);
            } catch (e) {
                return reject(e);
            }
        });
    },
    addItemToList: function (key, item) {
        return new Promise(async (resolve, reject) => {
            if (typeof item === 'object') {
                item = JSON.stringify(item);
            }

            try {
                await module.exports.conn.lPush(key, item);
                resolve();
            } catch (e) {
                return reject(e);
            }
        });
    },
    rPopLPush: function (key_from, key_to) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.rPopLPush(key_from, key_to);

                resolve(data);
            } catch (e) {
                return reject(e);
            }
        });
    },
    removeListItem: function (key, item) {
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof item === 'object') {
                    item = JSON.stringify(item);
                }

                await module.exports.conn.lRem(key, 0, item);

                resolve();
            } catch (e) {
                return reject(e);
            }
        });
    },
    getSortedSet: function (key, start, end) {
        return new Promise(async (resolve, reject) => {
            if (!key) {
                return reject('No key');
            }

            let results;

            try {
                if (typeof start === 'undefined' || typeof end === 'undefined') {
                    start = 0;
                    end = -1;
                }

                results = await module.exports.conn.zRange(key, start, end);

                return resolve(results);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    getSortedSetByScore: function (key, limit, lowest_to_highest) {
        return new Promise(async (resolve, reject) => {
            if (!key) {
                return reject('No key');
            }

            try {
                const multi = module.exports.startPipeline();

                if (limit) {
                    multi.addCommand([
                        'ZRANGE',
                        key,
                        lowest_to_highest ? '-inf' : '+inf',
                        lowest_to_highest ? '+inf' : '-inf',
                        'BYSCORE',
                        !lowest_to_highest ? 'REV' : '',
                        'LIMIT',
                        '0',
                        limit.toString(),
                    ]);
                } else {
                    multi.addCommand([
                        'ZRANGE',
                        key,
                        lowest_to_highest ? '-inf' : '+inf',
                        lowest_to_highest ? '+inf' : '-inf',
                        'BYSCORE',
                        !lowest_to_highest ? 'REV' : '',
                    ]);
                }

                const results = await multi.exec();

                return resolve(results[0]);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    prefixIndexer: function (items, score_key, keyGenerators, minPrefixLength = 2) {
        const { prefixKey } = keyGenerators;

        let batchSize = 5000;
        let logFrequency = 1000;
        let pipeline = module.exports.startPipeline();

        function getScore(item) {
            if (score_key.includes('is_')) {
                return item[score_key] ? 1 : 0;
            } else if (score_key in item) {
                return item[score_key];
            }

            return 0;
        }

        function getId(item) {
            return item.token || item.id?.toString();
        }

        function addPrefixToIndex(prefix, item, keyGenerator) {
            pipeline.zAdd(keyGenerator(prefix), [
                {
                    value: getId(item),
                    score: getScore(item),
                },
            ]);
        }

        function indexItem(item) {
            const nameLower = item.name?.toLowerCase() || '';

            // Index full name prefixes
            for (let i = 1; i <= nameLower.length; i++) {
                const prefix = nameLower.slice(0, i);
                addPrefixToIndex(prefix, item, prefixKey);
            }

            // Index individual word prefixes
            nameLower.split(' ').forEach((word) => {
                for (let i = 1; i <= word.length; i++) {
                    const prefix = word.slice(0, i);
                    addPrefixToIndex(prefix, item, prefixKey);
                }
            });
        }

        return new Promise(async (resolve, reject) => {
            for (let i = 0; i < items.length; i++) {
                let item = items[i];

                if (i % logFrequency === 0) {
                    console.log({ loop: i, total: items.length });
                }

                try {
                    indexItem(item);

                    // Execute pipeline in batches
                    if ((i + 1) % batchSize === 0) {
                        await pipeline.execAsPipeline();
                        pipeline = module.exports.startPipeline();
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            if (items.length > 0) {
                try {
                    await pipeline.execAsPipeline();
                } catch (e) {
                    console.error(e);
                }
            }

            resolve();
        });
    },
};
