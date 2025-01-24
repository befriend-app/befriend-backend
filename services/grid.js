const { loadScriptEnv, timeNow } = require('../services/shared');
const dbService = require('../services/db');
const { calculateDistanceMeters, km_per_degree_lat } = require('./shared');
loadScriptEnv();

const TABLE_NAME = 'earth_grid';
const COORD_PRECISION = 1000;
const DEFAULT_RADIUS_KM = 30;

let gridStructure = {
    lat: {},
};

let gridLookup = {
    byId: {},
    byToken: {}
}

let gridInitialization = {
    initialized: false,
    in_progress: false,
};

function waitForInitialized() {
    return new Promise(async (resolve, reject) => {
        let int = setInterval(function () {
            if (gridInitialization.initialized) {
                clearInterval(int);
                resolve();
            }
        }, 10);
    });
}

function initialize() {
    let prev_in_progress = gridInitialization.in_progress;

    if (!gridInitialization.in_progress) {
        gridInitialization.in_progress = true;
        console.log('Initializing grid service...');
    }

    const startTime = timeNow();

    return new Promise(async (resolve, reject) => {
        try {
            if (prev_in_progress) {
                await waitForInitialized();
                return resolve();
            }

            const conn = await dbService.conn();

            const records = await conn(TABLE_NAME)
                .whereNull('deleted')
                .select(
                    'id',
                    'token',
                    'lat_key',
                    'lon_key',
                    'center_lat',
                    'center_lon',
                    'grid_size_km',
                );

            for (let record of records) {
                addGridCell(record);
            }

            const totalTime = (timeNow() - startTime) / 1000;

            console.log(`Time taken: ${totalTime.toFixed(2)} seconds`);

            gridInitialization.initialized = true;
            gridInitialization.in_progress = false;

            resolve();
        } catch (error) {
            console.error('Failed to initialize grid service:', error);
            reject(error);
        }
    });
}

function addGridCell(cell) {
    const { lat_key, lon_key } = cell;

    if (!gridStructure.lat[lat_key]) {
        gridStructure.lat[lat_key] = { lon: {} };
    }

    if (!gridStructure.lat[lat_key].lon[lon_key]) {
        gridStructure.lat[lat_key].lon[lon_key] = [];
    }

    let data = {
        id: cell.id,
        token: cell.token,
        center_lat: cell.center_lat,
        center_lon: cell.center_lon,
    };

    gridStructure.lat[lat_key].lon[lon_key].push(data);

    gridLookup.byId[cell.id] = data;
    gridLookup.byToken[cell.token] = data;
}

function kmPerDegreeLon(lat) {
    return Math.cos((lat * Math.PI) / 180) * km_per_degree_lat;
}

function getKeys(lat, lon) {
    const rawLatKey = Math.floor(lat * COORD_PRECISION);
    const rawLonKey = Math.floor(lon * COORD_PRECISION);

    const latKey = Math.floor(rawLatKey / 100) * 100;
    const lonKey = Math.floor(rawLonKey / 100) * 100;

    return { lat_key: latKey, lon_key: lonKey };
}

function findNearest(lat, lon, radiusKm = DEFAULT_RADIUS_KM) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!gridInitialization.initialized) {
                await initialize();
            }

            const results = await findNearby(lat, lon, radiusKm, 1);
            resolve(results.length ? results[0] : null);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function findNearby(lat, lon, radiusKm = DEFAULT_RADIUS_KM, limit = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!gridInitialization.initialized) {
                await initialize();
            }

            const { lat_key, lon_key } = getKeys(lat, lon);
            const bucketsToSearch = Math.ceil(radiusKm / (km_per_degree_lat / 10));
            const results = [];

            for (let latDiff = -bucketsToSearch; latDiff <= bucketsToSearch; latDiff++) {
                const currentBucketLat = lat_key + latDiff * 100;
                const latBand = gridStructure.lat[currentBucketLat];

                if (latBand) {
                    const currentLat = currentBucketLat / COORD_PRECISION;
                    const lonBucketsToSearch = Math.ceil(
                        radiusKm / (kmPerDegreeLon(currentLat) / 10),
                    );

                    for (
                        let lonDiff = -lonBucketsToSearch;
                        lonDiff <= lonBucketsToSearch;
                        lonDiff++
                    ) {
                        const currentBucketLon = lon_key + lonDiff * 100;
                        const cells = latBand.lon[currentBucketLon];

                        if (cells) {
                            const cellsWithDistances = cells.map((cell) => ({
                                ...cell,
                                distance: calculateDistanceMeters(
                                    { lat, lon },
                                    { lat: cell.center_lat, lon: cell.center_lon },
                                    true,
                                ),
                            }));

                            results.push(
                                ...cellsWithDistances.filter((cell) => cell.distance <= radiusKm),
                            );
                        }
                    }
                }
            }

            const sorted = results.sort((a, b) => a.distance - b.distance);

            resolve(limit ? sorted.slice(0, limit) : sorted);
        } catch (e) {
            console.error(e);
            reject(e);
        }
    });
}

function getGridLookup() {
    return new Promise(async (resolve, reject) => {
        if(gridInitialization.initialized) {
            return resolve(gridLookup);
        }

        try {
            await initialize();

            resolve(gridLookup);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    findNearest,
    findNearby,
    getGridLookup
};
