module.exports = {
    conn: null,
    init: function () {
        return new Promise(async (resolve, reject) => {
            const redis = require('redis');

            let redis_ip = process.env.REDIS_HOST;

            module.exports.conn = redis.createClient(
                {
                    socket: {
                        host: `${redis_ip}`
                    }
                }
            );

            try {
                await module.exports.conn.connect();
            } catch(e) {
                return reject(e);
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
            } catch(e) {
                console.error(e);
                reject();
            }
        });
    },
    get: function (key, json) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.get(key);

                if(!json) {
                    return resolve(data);
                }

                try {
                    return resolve(JSON.parse(data));
                } catch(e) {
                    return resolve(null);
                }
            } catch(e) {
                return reject(e);
            }
        });
    },
    setCache: function (key, data, cache_lifetime = null) {
        return new Promise(async (resolve, reject) => {
            if(typeof data !== 'string') {
                data = JSON.stringify(data);
            }

            try {
                if(cache_lifetime) {
                    module.exports.conn.set(key, data, {
                        'EX': cache_lifetime
                    });
                } else {
                    module.exports.conn.set(key, data);
                }
            } catch(e) {
                console.error(e);
            }

            return resolve();
        });
    },
    formatKeyName: function (key, params = []) {
        let new_key = key;

        if(params) {
            for(let param of params) {
                if(param) {
                    param = JSON.stringify(param);
                    new_key += `-${param}`;
                }
            }
        }

        return new_key.replace(/ /g, "-");
    },
    deleteKeys: function (keys) {
        return new Promise(async (resolve, reject) => {
            try {
                await module.exports.conn.del(keys);
                return resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    execRedisMulti: function (multi) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await multi.exec();
                return resolve(data);
            } catch(e) {
                return reject(e);
            }
        });
    },
    addItemToSet(key, item) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof item === 'object') {
                    item = JSON.stringify(item);
                } else if(typeof item !== 'string') {
                    item = item.toString();
                }

                await module.exports.conn.sAdd(key, item);
                return resolve();
            } catch(e) {
                return reject(e);
            }
        });
    },
    addItemsToSet(key, items) {
        return new Promise(async (resolve, reject) => {
            if(!items.length) {
                return resolve();
            }

            function addToSet(key_items) {
                for(let i = 0; i < key_items.length; i++) {
                    let item = key_items[i];

                    if(typeof item !== 'string') {
                        key_items[i] = JSON.stringify(item);
                    }
                }

                return new Promise(async (resolve1, reject1) => {
                    try {
                        let data = await module.exports.conn.sAdd(key, key_items);
                        return resolve1(data);
                    } catch(err) {
                        reject1(err);
                    }
                });
            }

            let max_length = 1000000;

            let chunks = require('lodash').chunk(items, max_length);

            for(let chunk of chunks) {
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
            } catch(err) {
                reject(err);
            }
        });
    },
    getSetCount: function (key) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.sCard(key);
                resolve(data);
            } catch(e) {
                return reject(e);
            }
        });
    },
    isSetMember: function (key, member) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.sIsMember(key, member);
                resolve(data);
            } catch(e) {
                reject(e);
            }
        });
    },
    removeMemberFromSet: function (key, member) {
        return new Promise(async (resolve, reject) => {
            try {
                await module.exports.conn.sRem(key, member);
                return resolve();
            } catch(e) {
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
            } catch(e) {
                return reject(e);
            }
        });
    },
    addItemToList: function (key, item) {
        return new Promise(async (resolve, reject) => {
            if(typeof item === 'object') {
                item = JSON.stringify(item);
            }

            try {
                await module.exports.conn.lPush(key, item);
                resolve();
            } catch(e) {
                return reject(e);
            }
        });
    },
    rPopLPush: function (key_from, key_to) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await module.exports.conn.rPopLPush(key_from, key_to);

                resolve(data);
            } catch(e) {
                return reject(e);
            }
        });
    },
    removeListItem: function (key, item) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof item === 'object') {
                    item = JSON.stringify(item);
                }

                await module.exports.conn.lRem(key, 0, item);

                resolve();
            } catch(e) {
                return reject(e);
            }
        });
    },
};