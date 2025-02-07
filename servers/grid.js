const express = require('express');
const logger = require('morgan');

const { loadScriptEnv, km_per_degree_lat, calculateDistanceMeters, timeNow } = require('../services/shared');
const dbService = require('../services/db');

loadScriptEnv();

const router = express.Router();

const defaultPort = 3001;

const server = express();
const port = process.env.GRID_PORT || defaultPort;

server.use(logger('dev'));
server.use('/', router);
server.use(express.json());


const TABLE_NAME = 'earth_grid';
const COORD_PRECISION = 1000;
const DEFAULT_RADIUS_KM = 30;

let gridStructure = {
    lat: {},
};

let gridLookup = {
    byId: {},
    byToken: {}
};

let gridInitialization = {
    initialized: false,
    in_progress: false,
};

function initializeGrid() {
    return new Promise(async (resolve, reject) => {
        let prev_in_progress = gridInitialization.in_progress;

        if (!gridInitialization.in_progress) {
            gridInitialization.in_progress = true;
            console.log('Initializing grid service...');
        }

        const startTime = timeNow();

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
            console.log(`Grid initialization time: ${totalTime.toFixed(2)} seconds`);

            gridInitialization.initialized = true;
            gridInitialization.in_progress = false;

            resolve();
        } catch (error) {
            console.error('Failed to initialize grid service:', error);
            reject();
        }
    });
}

function waitForInitialized() {
    return new Promise((resolve) => {
        const int = setInterval(() => {
            if (gridInitialization.initialized) {
                clearInterval(int);
                resolve();
            }
        }, 10);
    });
}

async function ensureGridInitialized(req, res, next) {
    try {
        if (!gridInitialization.initialized) {
            await initializeGrid();
        }
        next();
    } catch (error) {
        next(error);
    }
}

router.get('/grid/id/:id', ensureGridInitialized, async (req, res) => {
    try {
        const grid = gridLookup.byId[req.params.id];

        if (!grid) {
            return res.status(400).json({ error: 'Grid not found' });
        }

        res.json(grid);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/grid/token/:token', ensureGridInitialized, async (req, res) => {
    try {
        const grid = gridLookup.byToken[req.params.token];

        if (!grid) {
            return res.status(400).json({ error: 'Grid not found' });
        }

        res.json(grid);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/grid/nearby', ensureGridInitialized, async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        const radiusKm = parseFloat(req.query.radius) || DEFAULT_RADIUS_KM;
        const limit = parseInt(req.query.limit) || null;

        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ error: 'Invalid latitude or longitude' });
        }

        const results = findNearby(lat, lon, radiusKm, limit);
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/grid/nearest', ensureGridInitialized, async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        const radiusKm = parseFloat(req.query.radius) || DEFAULT_RADIUS_KM;

        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ error: 'Invalid latitude or longitude' });
        }

        const result = findNearest(lat, lon, radiusKm);

        if (!result) {
            return res.status(400).json({ error: 'No grid found within specified radius' });
        }
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

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

function findNearby(lat, lon, radiusKm = DEFAULT_RADIUS_KM, limit = null) {
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

            for (let lonDiff = -lonBucketsToSearch; lonDiff <= lonBucketsToSearch; lonDiff++) {
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

                    results.push(...cellsWithDistances.filter((cell) => cell.distance <= radiusKm));
                }
            }
        }
    }

    const sorted = results.sort((a, b) => a.distance - b.distance);

    return limit ? sorted.slice(0, limit) : sorted;
}

function findNearest(lat, lon, radiusKm = DEFAULT_RADIUS_KM) {
    const results = findNearby(lat, lon, radiusKm, 1);

    return results.length ? results[0] : null;
}

async function main() {
    try {
        server.listen(port, () => {
            console.log(`Grid server listening on port: ${port}`);
        });

        await initializeGrid();
    } catch (error) {
        console.error('Failed to initialize grid service:', error);
        process.exit(1);
    }
}

function getPort() {
    return port;
}

module.exports = {
    router,
    getPort,
    main
};

if (require.main === module) {
    main();
}