const dbService = require('./db');
const { timeNow, isNumeric } = require('./shared');


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


module.exports = {
    keys: {
        sync: {
            data: {
                locations: 'sync_open_locations',
                music: {
                    artists: 'sync_music_artists',
                    artists_genres: 'sync_music_artists_genres',
                },
                schools: 'sync_schools',
            },
            network: {
                persons: 'sync_persons'
            },
        },
        system: {

        }
    },
    setProcessRan,
    getProcessRan
}