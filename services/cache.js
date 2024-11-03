const redis = require('redis');

module.exports = {
    conn: null,
    publisher: null,
    keys: {
        ws: 'ws:messages',
        activity_types: `activity_types`,
        activity_type_default: `activity_type:default`,
        cities_population: `cities:by_population`,
        me_sections: `sections:me`,
        instruments: `instruments`,
        instruments_common: `instruments:common`,
        activity: function (activity_token) {
            return `activity:${activity_token}`;
        },
        activity_type: function (token) {
            return `activity_type:${token}`;
        },
        activity_type_venue_categories: function (token) {
            return `activity_type:venue_categories:${token}`;
        },
        place_fsq: function (fsq_id) {
            return `place:fsq:${fsq_id}`;
        },
        city: function (id) {
            return `city:${id}`;
        },
        cities_country: function (code) {
            return `cities:country:${code}`;
        },
        cities_prefix: function (prefix) {
            return `cities:prefix:${prefix}`;
        },
        state: function (id) {
            return `state:${id}`;
        },
        country: function (id) {
            return `country:${id}`;
        },
        session: function (session) {
            return `session:api:${session}`;
        },
        exchange_keys: function (token) {
            return `networks:keys:exchange:${token}`;
        },
        address_geo: function (address_id) {
            return `address:geo:${address_id}`;
        },
        travel_times: function (token) {
            return `activities:travel:${token}`;
        },
        person: function (person_token_or_email) {
            if (!person_token_or_email) {
                throw new Error('No person_token or email provided');
            }

            person_token_or_email = person_token_or_email.toLowerCase();

            return `persons:${person_token_or_email}`;
        },
        person_login_tokens: function (person_token) {
            if (!person_token) {
                throw new Error('No person_token provided');
            }

            person_token = person_token.toLowerCase();

            return `persons:${person_token}:login_tokens`;
        },
        person_devices: function (person_token) {
            return `persons:devices:${person_token}`;
        },
        city_country_prefix: function (country_code, prefix) {
            return `cities:country:${country_code}:${prefix}`;
        },
        places_category_city: function (category_id, city_id) {
            return `places:category:${category_id}:city:${city_id}`;
        },
        person_sections: function (person_token) {
            return `persons:sections:${person_token}`;
        },
        person_sections_data: function (person_token, data_name) {
            return `persons:sections:${data_name}:${person_token}`;
        },
        instrument: function (token) {
            return `instrument:${token}`;
        },
        instruments_prefix: function (prefix) {
            return `instruments:prefix:${prefix}`;
        },
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
                    return resolve(JSON.parse(data));
                } catch (e) {
                    return resolve(null);
                }
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
    deleteKeys: function (keys) {
        return new Promise(async (resolve, reject) => {
            if (!keys || !keys.length) {
                return resolve();
            }

            try {
                await module.exports.conn.del(keys);
                return resolve();
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
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
                const multi = module.exports.conn.multi();

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
                        limit.toString()
                    ]);
                } else {
                    multi.addCommand([
                        'ZRANGE',
                        key,
                        lowest_to_highest ? '-inf' : '+inf',
                        lowest_to_highest ? '+inf' : '-inf',
                        'BYSCORE',
                        !lowest_to_highest ? 'REV' : '']);
                }

                const results = await multi.exec();

                return resolve(results[0]);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    prefixIndexer: function (items, score_key, keyGenerators) {
        const { mainKey, prefixKey } = keyGenerators;

        let batchSize = 5000;
        let logFrequency = 1000;
        let pipeline = module.exports.conn.multi();

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

            if (mainKey) {
                pipeline.hSet(mainKey(getId(item)), item);
            }

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
                        pipeline = module.exports.conn.multi();
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
