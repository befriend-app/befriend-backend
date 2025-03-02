const axios = require('axios');

const { loadScriptEnv } = require('../services/shared');
const { getPort, DEFAULT_RADIUS_KM } = require('../servers/grid');
loadScriptEnv();

let cacheData = {
    byId: {},
    byToken: {},
};

let grid_server_port = getPort();

function getGridById(id) {
    return new Promise(async (resolve, reject) => {
        if (cacheData.byId[id]) {
            return resolve(cacheData.byId[id]);
        }

        try {
            let r = await axios.get(`http://localhost:${grid_server_port}/grid/id/${id}`);

            cacheData.byId[id] = r.data;

            resolve(r.data);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getGridByToken(token) {
    return new Promise(async (resolve, reject) => {
        try {
            if (cacheData.byToken[token]) {
                return resolve(cacheData.byToken[token]);
            }

            try {
                let r = await axios.get(`http://localhost:${grid_server_port}/grid/token/${token}`);

                cacheData.byToken[token] = r.data;

                resolve(r.data);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function findNearby(lat, lon, radiusKm = DEFAULT_RADIUS_KM, limit = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const params = {
                lat,
                lon,
                radius: radiusKm,
            };

            if (limit !== null) {
                params.limit = limit;
            }

            let r = await axios.get(`http://localhost:${grid_server_port}/grid/nearby`, {
                params,
            });

            resolve(r.data);
        } catch (error) {
            reject(error);
        }
    });
}

function findNearest(lat, lon, radiusKm = DEFAULT_RADIUS_KM) {
    return new Promise(async (resolve, reject) => {
        try {
            const params = {
                lat,
                lon,
                radius: radiusKm,
            };

            let r = await axios.get(`http://localhost:${grid_server_port}/grid/nearest`, {
                params,
            });

            resolve(r.data);
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    getGridById,
    getGridByToken,
    findNearby,
    findNearest,
};
