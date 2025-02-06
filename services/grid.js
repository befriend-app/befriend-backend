const { loadScriptEnv } = require('../services/shared');
const cacheService = require('../services/cache');
const { timeNow } = require('./shared');
loadScriptEnv();

const DEFAULT_RADIUS_KM = 30;

let cacheData = {
    byId: {},
    byToken: {}
}


function getGridById(id) {
    return new Promise(async (resolve, reject) => {
        try {
            if(cacheData.byId[id]) {
                return resolve(cacheData.byId[id]);
            }

            let request = {
                fn: 'getGridById',
                id
            }

            let response = await cacheService.grid.publish(request);

            if(!response) {
                return reject('No response');
            }

            cacheData.byId[id] = response;

            resolve(response);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getGridByToken(token) {
    return new Promise(async (resolve, reject) => {
        try {
            if(cacheData.byToken[token]) {
                return resolve(cacheData.byToken[token]);
            }

            let request = {
                fn: 'getGridByToken',
                token
            }

            let response = await cacheService.grid.publish(request);

            if(!response) {
                return reject('No response');
            }

            cacheData.byToken[token] = response;

            resolve(response);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function findNearby(lat, lon, radiusKm = DEFAULT_RADIUS_KM, limit = null) {
    return new Promise(async (resolve, reject) => {
         try {
              let request = {
                  fn: 'findNearby',
                  lat,
                  lon,
                  radiusKm,
                  limit
              }

              let response = await cacheService.grid.publish(request);

             if(!response) {
                 return reject('No response');
             }

             resolve(response);
         } catch(e) {
             console.error(e);
             return reject(e);
         }
    });
}

function findNearest(lat, lon, radiusKm = DEFAULT_RADIUS_KM) {
    return new Promise(async (resolve, reject) => {
        try {
            let request = {
                fn: 'findNearest',
                lat,
                lon,
                radiusKm,
            }

            let response = await cacheService.grid.publish(request);

            if(!response) {
                return reject('No response');
            }

            resolve(response);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    getGridById,
    getGridByToken,
    findNearby,
    findNearest
};
