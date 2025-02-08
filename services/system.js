const cacheService = require('./cache');
const dbService = require('./db');
const { timeNow, isNumeric } = require('./shared');


function getProcessRan(system_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let qry = await conn('system').where('system_key', system_key).first();

            if (!qry || !qry.system_value) {
                return resolve(false);
            }

            let value = qry.system_value.toLowerCase();

            if (value === 'true') {
                return resolve(true);
            }

            if (isNumeric(value)) {
                if (parseInt(value)) {
                    return resolve(true);
                }
            }

            return resolve(false);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function setProcessRan(system_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let qry = await conn('system').where('system_key', system_key).first();

            if (qry) {
                await conn('system').where('id', qry.id).update({
                    updated: timeNow(),
                });
            } else {
                await conn('system').insert({
                    system_key: system_key,
                    system_value: 1,
                    created: timeNow(),
                    updated: timeNow(),
                });
            }

            resolve();
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}


function getNetworkSyncProcess(sync_name, network_id) {
    return new Promise(async (resolve, reject) => {
        try {
            let data = await cacheService.getObj(cacheService.keys.sync_networks(sync_name, network_id));

            resolve(data);
        } catch(e) {
            console.error(e);
            reject();
        }
    });
}

function setNetworkSyncProcess(sync_name, network_id, data) {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.setCache(cacheService.keys.sync_networks(sync_name, network_id), data);

            resolve();
        } catch(e) {
            console.error(e);
            reject();
        }
    });
}


module.exports = {
    keys: {
        sync: {
            data: {
                earth: 'sync_earth_grid',
                locations: 'sync_open_locations',
                movies: {
                    all: 'sync_movies',
                    genres: 'sync_movies_genres',
                },
                music: {
                    artists: 'sync_music_artists',
                    artists_genres: 'sync_music_artists_genres',
                },
                schools: 'sync_schools',
                tv: {
                    shows: 'sync_tv_shows',
                    genres: 'sync_tv_shows_genres',
                },
            },
            network: {
                networks_persons: 'sync_networks_persons',
                persons: 'sync_persons',
                persons_modes: 'sync_persons_modes',
                persons_me: 'sync_persons_me',
                persons_filters: 'sync_persons_filters',
            },
        },
        system: {},
    },
    getProcessRan,
    getNetworkSyncProcess,
    setProcessRan,
    setNetworkSyncProcess,
};
