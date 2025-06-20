const axios = require('axios');
const dayjs = require('dayjs');
const fs = require('fs');
const process = require('process');
const tldts = require('tldts');

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

global.serverTimezoneString = process.env.TZ || 'America/Chicago';

const data_api_url = 'https://data.befriend.app';

const earth_radius_km = 6371;
const earth_radius_miles = 3958.762079;
const km_per_degree_lat = 111.32;
const kms_per_mile = 1.60934;
const miles_per_meter = 0.000621371192;

Object.defineProperty(String.prototype, 'capitalize', {
    value: function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    },
    enumerable: false,
});

let geoLookup = {
    gridSize: 10,
    grid: null,
    countries: null,
    buildIndex: function () {
        this.grid = new Map();

        for (let country of geoLookup.countries) {
            // Calculate grid cells that this bounding box intersects
            const minGridX = Math.floor(country.min_lon / this.gridSize);
            const maxGridX = Math.ceil(country.max_lon / this.gridSize);
            const minGridY = Math.floor(country.min_lat / this.gridSize);
            const maxGridY = Math.ceil(country.max_lat / this.gridSize);

            // Add box to all intersecting grid cells
            for (let x = minGridX; x <= maxGridX; x++) {
                for (let y = minGridY; y <= maxGridY; y++) {
                    const cellKey = `${x},${y}`;
                    if (!this.grid.has(cellKey)) {
                        this.grid.set(cellKey, []);
                    }

                    this.grid.get(cellKey).push(country);
                }
            }
        }
    },
};

function checkSinglePolygon(lat, lon, polygonCoords) {
    if (!polygonCoords || !polygonCoords[0]) return false;

    let inside = false;

    const ring = polygonCoords[0];

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        // GeoJSON coordinates are in [lon, lat] order
        const lon1 = ring[i][0];
        const lat1 = ring[i][1];
        const lon2 = ring[j][0];
        const lat2 = ring[j][1];

        // Check if point crosses the ray
        if (
            lat1 > lat !== lat2 > lat &&
            lon < ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1) + lon1
        ) {
            inside = !inside;
        }
    }

    return inside;
}

function checkIfPathExists(p) {
    return new Promise((resolve, reject) => {
        require('fs').exists(p, function (exists) {
            let bool = exists ? true : false;
            return resolve(bool);
        });
    });
}

function makeDirectory(d) {
    return new Promise(async (resolve, reject) => {
        require('fs').mkdir(d, function (err) {
            if(err) {
                return reject(err);
            }

            resolve();
        });
    });
}

function createDirectoryIfNotExistsRecursive(dirname) {
    return new Promise(async (resolve, reject) => {
        var slash = '/';
        let directories_backwards = [dirname];
        let minimize_dir = dirname;
        let directories_needed = [];
        let directories_forwards = [];

        // backward slashes for windows
        // if(getIsWindows()) {
        //     slash = '\\';
        // }

        while (minimize_dir = minimize_dir.substring(0, minimize_dir.lastIndexOf(slash))) {
            directories_backwards.push(minimize_dir);
        }

        //stop on first directory found
        for(const d in directories_backwards) {
            let dir = directories_backwards[d];
            let exists = await checkIfPathExists(dir);
            if(!exists) {
                directories_needed.push(dir);
            } else {
                break;
            }
        }

        //no directories missing
        if(!directories_needed.length) {
            return resolve();
        }

        // make all directories in ascending order
        directories_forwards = directories_needed.reverse();

        for(const d in directories_forwards) {
            try {
                let dir = directories_forwards[d];

                try {
                    await makeDirectory(dir);
                } catch (e) {
                    console.error(e);
                }
            } catch(e) {
                console.error(e);
            }
        }

        return resolve();
    });
}


function pointInPolygon(lat, lon, coordinates) {
    if (!coordinates || !coordinates.length) return false;

    if (Array.isArray(coordinates[0][0][0])) {
        // Check each polygon in the MultiPolygon
        return coordinates.some((polygon) => checkSinglePolygon(lat, lon, polygon));
    }

    return checkSinglePolygon(lat, lon, coordinates);
}

function _normalizeLongitude(lon) {
    lon = lon % 360;

    if (lon > 180) {
        lon -= 360;
    }

    return lon;
}

function latLonLookup(lat, lon) {
    return new Promise(async (resolve, reject) => {
        if (!lat || !lon) {
            return resolve(null);
        }

        if (!isNumeric(lat) || !isNumeric(lon)) {
            return resolve(null);
        }

        //initialize geo lookup
        if (!geoLookup.countries) {
            try {
                let countries = (await require('./locations').getCountries()).list;

                geoLookup.countries = structuredClone(countries);
            } catch (e) {
                console.error(e);
            }

            //add polygon data for each country
            for (let c of geoLookup.countries) {
                if (!c.coordinates) {
                    let data_path = joinPaths(
                        getRepoRoot(),
                        'node_modules/geojson-places/data/countries',
                        `${c.country_code}.json`,
                    );

                    if (await pathExists(data_path)) {
                        let country_feature = require(data_path);

                        c.coordinates = country_feature.geometry.coordinates;
                    }
                }
            }
        }

        if (!geoLookup.grid) {
            geoLookup.buildIndex();
        }

        lat = parseFloat(lat);
        lon = parseFloat(lon);

        lon = _normalizeLongitude(lon);

        // Find grid cell
        const gridX = Math.floor(lon / geoLookup.gridSize);
        const gridY = Math.floor(lat / geoLookup.gridSize);
        const cellKey = `${gridX},${gridY}`;

        // Find country
        if (geoLookup.grid.has(cellKey)) {
            for (const country of geoLookup.grid.get(cellKey)) {
                // quick bounding box check
                if (
                    lat >= country.min_lat &&
                    lat <= country.max_lat &&
                    lon >= country.min_lon &&
                    lon <= country.max_lon
                ) {
                    if (country.coordinates) {
                        const isInside = pointInPolygon(lat, lon, country.coordinates);

                        if (isInside) {
                            return resolve({
                                id: country.id,
                                emoji: country.emoji,
                                name: country.country_name,
                                code: country.country_code,
                            });
                        }
                    }
                }
            }
        }

        return resolve(null);
    });
}

function birthDatePure(birth_date) {
    if (!birth_date) {
        return null;
    }

    return birth_date.substring(0, 10);
}

function calculateAge(birth_date) {
    if (!birth_date) {
        return null;
    }

    return dayjs().diff(dayjs(birth_date), 'year');
}

function calculateDistanceFeet(loc_1, loc_2) {
    const distanceInMeters = calculateDistanceMeters(loc_1, loc_2, false);

    const distanceInFeet = distanceInMeters * 3.28084;

    return Math.round(distanceInFeet * 100) / 100;
}

function calculateDistanceMeters(loc_1, loc_2, in_km) {
    const dLat = deg2rad(loc_2.lat - loc_1.lat);
    const dLon = deg2rad(loc_2.lon - loc_1.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((loc_1.lat * Math.PI) / 180) *
            Math.cos((loc_1.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (in_km) {
        return earth_radius_km * c;
    }

    return earth_radius_km * c * 1000;
}

function changeTimezone(date, ianatz) {
    let invdate = new Date(
        date.toLocaleString('en-US', {
            timeZone: ianatz,
        }),
    );

    let diff = date.getTime() - invdate.getTime();

    return new Date(date.getTime() - diff);
}

function cloneObj(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error(e);
        return null;
    }
}

function dataEndpoint(route) {
    return joinPaths(process.env.DATA_API_DOMAIN || data_api_url, route);
}

function dateTimeNow(date) {
    if (!date) {
        date = new Date();
    }

    return date.toISOString().slice(0, 10) + ' ' + date.toISOString().substring(11, 19);
}

function deleteFile(file_path) {
    return new Promise(async (resolve, reject) => {
        fs.unlink(file_path, (err) => {
            if (err) {
                return reject(err);
            } else {
                resolve();
            }
        });
    });
}

function downloadURL(url, output_path) {
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: {
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
            });

            let w = fs.createWriteStream(output_path);

            response.data.pipe(w);

            w.on('finish', function () {
                resolve();
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function floatOrNull(value) {
    if (isNumeric(value)) {
        return parseFloat(value);
    }

    return null;
}

function formatNumberLength(num, length) {
    let r = '' + num;

    while (r.length < length) {
        r = '0' + r;
    }
    return r;
}

function formatObjectTypes(obj) {
    function convertValue(value) {
        // Handle non-strings
        if (typeof value !== 'string') {
            return value;
        }

        // Handle empty strings
        if (value.trim() === '') {
            return value;
        }

        // Handle boolean values
        if (value.toLowerCase() === 'true') {
            return true;
        }

        if (value.toLowerCase() === 'false') {
            return false;
        }

        // Handle numeric values
        if (/^-?\d*\.?\d+$/.test(value)) {
            const num = Number(value);
            return Number.isFinite(num) ? num : value;
        }

        return value;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => formatObjectTypes(item));
    }

    // Handle null or non-objects
    if (obj === null || typeof obj !== 'object') {
        return convertValue(obj);
    }

    // Process object properties
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        result[key] = formatObjectTypes(value);
    }
    return result;
}

function generateOTP(length = 6) {
    if (!Number.isInteger(length) || length <= 0) {
        throw new Error("Length must be a positive integer");
    }

    let otp = "";
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10);
    }

    return otp;
}

function generateToken(length) {
    if (!length) {
        length = 16;
    }

    //edit the token allowed characters
    let a = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
    let b = [];

    for (let i = 0; i < length; i++) {
        let j = (Math.random() * (a.length - 1)).toFixed(0);
        b[i] = a[j];
    }

    return b.join('');
}

function getBicyclingTime(distance_meters) {
    const AVERAGE_BICYCLING_SPEED = 15; // km/h

    const timeHours = distance_meters / 1000 / AVERAGE_BICYCLING_SPEED;

    return getTimeFromSeconds(timeHours * 3600);
}

function getCityState(zip, blnUSA = true) {
    return new Promise(async (resolve, reject) => {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?components=country:US|postal_code:${zip}&key=${process.env.GMAPS_KEY}`;

        try {
            let address_info = await axios.get(url);
        } catch (e) {
            return reject(e);
        }

        let city = '';
        let state = '';
        let country = '';

        let data = address_info.data;

        if (data.results && data.results.length) {
            for (let component of data.results[0].address_components) {
                let type = component.types[0];

                if ((city === '' && type === 'sublocality_level_1') || type === 'locality') {
                    city = component.short_name.trim();
                }

                if (state === '' && type === 'administrative_area_level_1') {
                    state = component.short_name.trim();
                }

                if (country === '' && type === 'country') {
                    country = component.short_name.trim();

                    if (blnUSA && country !== 'US') {
                        city = '';
                        state = '';
                        break;
                    }
                }

                if (city && state && country) {
                    break;
                }
            }
        }

        return resolve({
            city: city,
            state: state,
            zip: zip,
            country: country,
        });
    });
}

function getCleanDomain(domain, remove_subdomain, allow_local) {
    if (!domain) {
        return null;
    }

    if (typeof domain !== 'string') {
        throw Error('Domain should be a string');
    }

    if (!isProdApp() && allow_local) {
        //do not alter ip/localhost addresses in dev
        if (isIPAddress(domain) || isLocalHost(domain)) {
            return domain;
        }
    }

    //lowercase
    let clean_domain = domain.toLowerCase();

    //remove http, https
    if (!isIPAddress(clean_domain)) {
        clean_domain = clean_domain.replace('https://', '').replace('http://', '');
    }

    if (remove_subdomain) {
        if (!isIPAddress(clean_domain)) {
            clean_domain = tldts.parse(clean_domain).domain;
        }
    }

    return clean_domain;
}

function deg2rad(deg) {
    return (deg * Math.PI) / 180;
}

function rad2deg(rad) {
    return (rad * 180) / Math.PI;
}

function getCoordsBoundBox(latitude, longitude, distance_miles_or_km) {
    const latLimits = [deg2rad(-90), deg2rad(90)];
    const lonLimits = [deg2rad(-180), deg2rad(180)];

    const radLat = deg2rad(latitude);
    const radLon = deg2rad(longitude);

    if (
        radLat < latLimits[0] ||
        radLat > latLimits[1] ||
        radLon < lonLimits[0] ||
        radLon > lonLimits[1]
    ) {
        throw new Error('Invalid Argument');
    }

    // Angular distance in radians on a great circle,
    let angular;

    if (useKM()) {
        angular = distance_miles_or_km / earth_radius_km;
    } else {
        angular = distance_miles_or_km / earth_radius_miles;
    }

    let minLat = radLat - angular;
    let maxLat = radLat + angular;

    let minLon, maxLon;

    if (minLat > latLimits[0] && maxLat < latLimits[1]) {
        const deltaLon = Math.asin(Math.sin(angular) / Math.cos(radLat));
        minLon = radLon - deltaLon;

        if (minLon < lonLimits[0]) {
            minLon += 2 * Math.PI;
        }

        maxLon = radLon + deltaLon;

        if (maxLon > lonLimits[1]) {
            maxLon -= 2 * Math.PI;
        }
    } else {
        // A pole is contained within the distance.
        minLat = Math.max(minLat, latLimits[0]);
        maxLat = Math.min(maxLat, latLimits[1]);
        minLon = lonLimits[0];
        maxLon = lonLimits[1];
    }

    let degMinLat = rad2deg(minLat);
    let degMinLon = rad2deg(minLon);
    let degMaxLat = rad2deg(maxLat);
    let degMaxLon = rad2deg(maxLon);

    return {
        minLat: degMinLat,
        minLon: degMinLon,
        maxLat: degMaxLat,
        maxLon: degMaxLon,
        minLat1000: parseInt(Math.floor(degMinLat * 1000)),
        minLon1000: parseInt(Math.floor(degMinLon * 1000)),
        maxLat1000: parseInt(Math.floor(degMaxLat * 1000)),
        maxLon1000: parseInt(Math.floor(degMaxLon * 1000)),
    };
}

function getCoordsFromPointDistance(lat, lon, distance_km, direction) {
    const latRad = deg2rad(lat);
    const lonRad = deg2rad(lon);

    let newLat, newLon;

    if (direction === 'east' || direction === 'west') {
        newLat = lat;

        let newLonRad;

        if (direction === 'east') {
            newLonRad = lonRad + distance_km / (earth_radius_km * Math.cos(latRad));
        } else {
            newLonRad = lonRad - distance_km / (earth_radius_km * Math.cos(latRad));
        }

        newLon = rad2deg(newLonRad);
    } else if (direction === 'south' || direction === 'north') {
        newLon = lon;

        let newLatRad;

        if (direction === 'south') {
            newLatRad = latRad - distance_km / earth_radius_km;
        } else {
            newLatRad = latRad + distance_km / earth_radius_km;
        }

        newLat = rad2deg(newLatRad);
    }

    return {
        lat: newLat,
        lon: newLon,
    };
}

function getDateDiff(date_1, date_2, unit) {
    let dayjs = require('dayjs');

    date_1 = dayjs(date_1);
    date_2 = dayjs(date_2);

    return date_1.diff(date_2, unit);
}

function getDateStr(date) {
    let dayjs = require('dayjs');
    let obj = dayjs(date);
    return obj.format('YYYY-MM-DD');
}

function getDateTimeStr() {
    let date = new Date();
    return date.toISOString().slice(0, 10) + ' ' + date.toISOString().substring(11, 19);
}

function getDistanceMilesOrKM(loc_1, loc_2) {
    let distance_meters = calculateDistanceMeters(loc_1, loc_2);

    return getMilesOrKmFromMeters(distance_meters);
}

function getIPAddr(req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
}

function getLocalDate() {
    return getLocalDateStr(changeTimezone(new Date(), serverTimezoneString));
}

function getLocalDateStr(date) {
    if (!date) {
        date = new Date();
    }

    const offset = date.getTimezoneOffset();
    const offsetAbs = Math.abs(offset);
    const isoString = new Date(date.getTime() - offset * 60 * 1000).toISOString();
    let str = `${isoString.slice(0, -1)}${offset > 0 ? '-' : '+'}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`;
    str = str.replace('T', ' ').substring(0, 19);
    return str;
}

function getLocalDateTimeStr(date) {
    if (!date) {
        date = new Date();
    }

    let dayjs = require('dayjs');

    dayjs = dayjs(date);

    return dayjs.format('MM-DD-YY HH:mm:ss');
}

function getMetersFromMilesOrKm(miles_or_km, to_int) {
    let meters;

    if (useKM()) {
        meters = miles_or_km * 1000;
    } else {
        meters = miles_or_km / miles_per_meter;
    }

    if (to_int) {
        return Math.floor(meters);
    }

    return meters;
}

function getMilesOrKmFromMeters(meters) {
    if (useKM()) {
        return meters / 1000;
    } else {
        return meters * miles_per_meter;
    }
}

function roundTimeMinutes(time, minutes) {
    let timeToReturn = new Date(time);

    timeToReturn.setMilliseconds(Math.round(timeToReturn.getMilliseconds() / 1000) * 1000);
    timeToReturn.setSeconds(Math.round(timeToReturn.getSeconds() / 60) * 60);
    timeToReturn.setMinutes(Math.round(timeToReturn.getMinutes() / minutes) * minutes);

    return timeToReturn;
}

function getOptionDateTime(option) {
    if (!option) {
        throw new Error('No option provided');
    }

    let date_now = dayjs();

    let date = date_now.add(option.in_mins, 'minutes');

    let round_minutes;

    if (option.in_mins >= 240) {
        // 4 hours or more
        round_minutes = 30;
    } else if (option.in_mins >= 120) {
        // 2 hours or more
        round_minutes = 15;
    } else {
        round_minutes = 5;
    }

    //make time round
    let js_date = roundTimeMinutes(date, round_minutes);
    date = dayjs(js_date);

    //add more time if activity starts in less than an hour
    let minutes_diff = date.diff(date_now, 'minutes') - option.in_mins;

    if (minutes_diff < 0) {
        let add_mins = Math.ceil(Math.abs(minutes_diff) / round_minutes) * round_minutes;

        date = date.add(add_mins, 'minutes');
    }

    return date;
}

function getRandomInRange(from, to, fixed) {
    return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
}

function getRepoRoot() {
    let slash = `/`;

    if (process.platform.startsWith('win')) {
        slash = `\\`;
    }

    let path_split = __dirname.split(slash);

    let path_split_slice = path_split.slice(0, path_split.length - 1);

    return path_split_slice.join(slash);
}

function getReverseClientURLScheme(client) {
    if(!client) {
        throw new Error('No client id provided');
    }

    let clientSplit = client.split('.');

    clientSplit.reverse();

    return clientSplit.join('.');
}

function getStatesList() {
    return {
        AL: 'Alabama',
        AK: 'Alaska',
        AZ: 'Arizona',
        AR: 'Arkansas',
        CA: 'California',
        CO: 'Colorado',
        CT: 'Connecticut',
        DE: 'Delaware',
        DC: 'District Of Columbia',
        FL: 'Florida',
        GA: 'Georgia',
        HI: 'Hawaii',
        ID: 'Idaho',
        IL: 'Illinois',
        IN: 'Indiana',
        IA: 'Iowa',
        KS: 'Kansas',
        KY: 'Kentucky',
        LA: 'Louisiana',
        ME: 'Maine',
        MD: 'Maryland',
        MA: 'Massachusetts',
        MI: 'Michigan',
        MN: 'Minnesota',
        MS: 'Mississippi',
        MO: 'Missouri',
        MT: 'Montana',
        NE: 'Nebraska',
        NV: 'Nevada',
        NH: 'New Hampshire',
        NJ: 'New Jersey',
        NM: 'New Mexico',
        NY: 'New York',
        NC: 'North Carolina',
        ND: 'North Dakota',
        OH: 'Ohio',
        OK: 'Oklahoma',
        OR: 'Oregon',
        PA: 'Pennsylvania',
        PR: 'Puerto Rico',
        RI: 'Rhode Island',
        SC: 'South Carolina',
        SD: 'South Dakota',
        TN: 'Tennessee',
        TX: 'Texas',
        UT: 'Utah',
        VT: 'Vermont',
        VA: 'Virginia',
        WA: 'Washington',
        WV: 'West Virginia',
        WI: 'Wisconsin',
        WY: 'Wyoming',
    };
}

function getTimeFromSeconds(seconds) {
    if (seconds < 0) {
        return null;
    }

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const total = hours * 60 + mins;

    return {
        hours,
        mins,
        total,
    };
}

function getTimeZoneFromCoords(lat, lon) {
    const { find } = require('geo-tz');

    let tz = find(lat, lon);

    if (tz && tz.length) {
        return tz[0];
    }

    return null;
}

function getURL(raw_domain, endpoint = '') {
    if (!raw_domain) {
        throw new Error('Domain required');
    }

    if (typeof endpoint === 'undefined') {
        throw new Error('No endpoint provided');
    }

    //use provided protocol for dev
    if (!isProdApp()) {
        if (isIPAddress(raw_domain) || isLocalHost(raw_domain)) {
            // use http if only ip/localhost string
            if (raw_domain.startsWith('http')) {
                return joinPaths(raw_domain, endpoint);
            }

            return joinPaths(`http://${raw_domain}`, endpoint);
        }
    }

    if (raw_domain.startsWith('http')) {
        return joinPaths(raw_domain, endpoint);
    }

    return joinPaths(`https://${raw_domain}`, endpoint);
}

function getWalkingTime(distance_meters) {
    const AVERAGE_WALKING_SPEED = 5; // km/h

    const timeHours = distance_meters / 1000 / AVERAGE_WALKING_SPEED;

    return getTimeFromSeconds(timeHours * 3600);
}

function hasPort(domain) {
    if (!domain) {
        return false;
    }

    let pure_domain = getCleanDomain(domain);

    let split = pure_domain.split(':');

    return split.length > 1;
}

function isLatValid(lat) {
    return !(isNaN(lat) || lat > 90 || lat < -90);
}

function isLonValid(lon) {
    return !(isNaN(lon) || lon > 180 || lon < -180);
}

function isIPAddress(address) {
    if (!address || typeof address !== 'string') {
        return false;
    }

    //remove https, http
    address = address.replace('https://', '').replace('http://', '');

    //remove port
    let domain_no_port = address.split(':')[0];
    let ip_re =
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return !!domain_no_port.match(ip_re);
}

function isLocalHost(address) {
    if (!address) {
        return false;
    }

    if (typeof address !== 'string') {
        throw 'Address is not a string';
    }

    let domain = address.toLowerCase();

    domain = domain.replace('https://', '').replace('http://', '');

    let parsed = tldts.parse(domain);

    return parsed.publicSuffix && parsed.publicSuffix === 'localhost';
}

function isLocalApp() {
    return process.env.APP_ENV.includes('local');
}

function isNumeric(val) {
    return !isNaN(parseFloat(val)) && isFinite(val);
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProdApp() {
    return process.env.APP_ENV && process.env.APP_ENV.includes('prod');
}

function isValidBase64Image(base64String, allowPrefixed = true) {
    // Handle empty or non-string inputs
    if (!base64String || typeof base64String !== 'string') {
        return false;
    }

    // Extract the base64 data if it includes the data URI prefix
    let rawBase64 = base64String;
    
    if (base64String.startsWith('data:image')) {
        if (!allowPrefixed) {
            return false; // Prefix not allowed
        }

        // Extract the base64 part after the comma
        let commaIndex = base64String.indexOf(',');
        if (commaIndex === -1) {
            return false; // Malformed data URI
        }

        rawBase64 = base64String.substring(commaIndex + 1);
    }

    // Check if it's a valid base64 string
    try {
        // Verify the base64 string structure
        if (!/^[A-Za-z0-9+/=]+$/.test(rawBase64)) {
            return false; // Contains invalid characters
        }

        // Check if the length is valid
        // Base64 length should be a multiple of 4
        if (rawBase64.length % 4 !== 0) {
            return false;
        }

        // Attempt to decode it
        let decoded = atob(rawBase64);

        // Additional validation for JPG format
        if (isJPEGImage(decoded)) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error validating base64 image:', error);
        return false;
    }
}

function isJPEGImage(decodedString) {
    // JPEG files start with the bytes: FF D8 FF
    // In the decoded string, these will be the characters with char codes 255, 216, 255
    if (decodedString.length < 3) {
        return false;
    }

    let byte1 = decodedString.charCodeAt(0);
    let byte2 = decodedString.charCodeAt(1);
    let byte3 = decodedString.charCodeAt(2);

    return byte1 === 0xFF && byte2 === 0xD8 && byte3 === 0xFF;
}

function isValidEmail(email) {
    let re =
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

function isValidPhone(phoneNumber, countryCode = '+1') {
    if (!phoneNumber) {
        return false;
    }

    // Strip all non-numeric characters
    const stripped = phoneNumber.replace(/\D/g, '');

    switch (countryCode) {
        case '+1':
            // US numbers should be 10 digits (or 11 with leading 1)
            if (stripped.length === 10) {
                return true;
            } else if (stripped.length === 11 && stripped.charAt(0) === '1') {
                return true;
            }
            return false;

        case '+44':
            // UK numbers should be 10 or 11 digits
            return (stripped.length === 10 || stripped.length === 11);

        default:
            // Default: must be at least 8 digits
            return stripped.length >= 8;
    }
}

function isValidUserName(username) {
    const valid = /^[a-z0-9_\.]+$/.exec(username);
    return valid;
}

function joinPaths() {
    let args = [];

    for (let i = 0; i < arguments.length; i++) {
        let arg = arguments[i] + '';
        if (!arg) {
            continue;
        }

        if (typeof arg === 'number') {
            arg = arg.toString();
        }

        args.push(arg);
    }

    let slash = '/';

    if (process.platform === 'win32' && args[0].includes('\\')) {
        slash = '\\';
    }

    let url = args
        .map((part, i) => {
            if (i === 0) {
                let re = new RegExp(`[\\${slash}]*$`, 'g');
                return part.trim().replace(re, '');
            } else {
                let re = new RegExp(`(^[\\${slash}]*|[\\/]*$)`, 'g');
                return part.trim().replace(re, '');
            }
        })
        .filter((x) => x.length)
        .join(slash);

    if (!url.startsWith('http') && !url.startsWith('/')) {
        url = `/${url}`;
    }

    return url;
}

function loadScriptEnv() {
    //change directory not supported in workers
    //env variables passed down from parent to workers

    if(process.is_worker_thread) {
        return;
    }

    let repo_root = getRepoRoot();

    process.chdir(repo_root);

    require('dotenv').config();
}

function normalizeDistance(distance, radius_meters) {
    return 1 - Math.min(distance / radius_meters, 1);
}

function normalizePort(val) {
    let port = parseInt(val, 10);

    if (isNaN(port)) {
        return val;
    }

    if (port >= 0) {
        return port;
    }

    return false;
}

function removeArrItem(arr, item) {
    let index = arr.indexOf(item);
    if (index > -1) {
        arr.splice(index, 1);
    }
}

function stringDistance(str1, str2) {
    const grid = [];
    for (let i = 0; i <= str1.length; i++) {
        grid[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
        grid[0][j] = j;
    }
    for (let i = 1; i <= str1.length; i++) {
        for (let j = 1; j <= str2.length; j++) {
            const substitution = grid[i - 1][j - 1] + (str1[i - 1] === str2[j - 1] ? 0 : 1);
            grid[i][j] = Math.min(
                grid[i - 1][j] + 1, // deletion
                grid[i][j - 1] + 1, // insertion
                substitution,
            ); // substitution
        }
    }
    return grid[str1.length][str2.length];
}

function normalizeSearch(search, skip_lowercase) {
    if (!search) {
        return null;
    }

    let clean_search;

    if (!skip_lowercase) {
        clean_search = search.toLowerCase();
    }

    //remove extra space
    clean_search = clean_search.trim().replace(/\s+/g, ' ');

    //remove non-allowed characters
    let regex = /[^a-zA-Z0-9 ,.'-]+/;

    clean_search = clean_search.replace(regex, '');

    return clean_search;
}

function numberWithCommas(x, to_integer) {
    if (!x) {
        return x;
    }

    if (to_integer) {
        x = Number.parseInt(x);
    }

    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pathExists(p) {
    return new Promise(async (resolve, reject) => {
        fs.access(p, fs.constants.F_OK, function (err) {
            if (err) {
                return resolve(false);
            }

            return resolve(true);
        });
    });
}

function range(min, max) {
    let arr = [];

    for (let i = min; i <= max; i++) {
        arr.push(i);
    }

    return arr;
}

function readFile(p, json) {
    return new Promise((resolve, reject) => {
        require('fs').readFile(p, function (err, data) {
            if (err) {
                return reject(err);
            }

            if (data) {
                data = data.toString();
            }

            if (json) {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return reject(e);
                }
            }

            return resolve(data);
        });
    });
}

function sanitizePrivateKey(keyString) {
    if (!keyString) {
        return '';
    }

    return keyString
        .split('\n')
        .map(line => {
            return line.trim();
        })
        .join('\n');
}

function saveFile(filePath, data) {
    return new Promise(async (resolve, reject) => {
        try {
            let dirName = require('path').dirname(filePath);
            await createDirectoryIfNotExistsRecursive(dirName);
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        fs.writeFile(filePath, data, (err) => {
            if (err) {
                return reject(err);
            } else {
                resolve();
            }
        });
    });
}

function sendEmail(subject, html, email, from, cc, attachment_alt) {
    return new Promise(async (resolve, reject) => {
        if (!from) {
            from = process.env.EMAIL_FROM;
        }

        const sgMail = require('@sendgrid/mail');

        sgMail.setApiKey(process.env.SENDGRID_KEY);

        let sendMsg = {
            trackingSettings: {
                clickTracking: {
                    enable: false,
                    enableText: false,
                },
            },
            to: email,
            from: from,
            subject: subject,
            html: html,
        };

        try {
            await sgMail.send(sendMsg);
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        if (cc) {
            try {
                let cc_message = sendMsg;
                cc_message.to = process.env.EMAIL_FROM;
                await sgMail.send(cc_message);
            } catch (e) {
                console.error(e);
            }
        }

        return resolve();
    });
}

function shuffleFunc(array) {
    let currentIndex = array.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function slugName(name) {
    return require('slugify')(name, {
        lower: true,
        strict: true,
    });
}

function timeNow(seconds) {
    if (seconds) {
        return Number.parseInt(Date.now() / 1000);
    }

    return Date.now();
}

function timeoutAwait(ms, f) {
    return new Promise(async (resolve, reject) => {
        setTimeout(function () {
            if (f) {
                f();
            }

            resolve();
        }, ms);
    });
}

function getContentType (content_type) {
    if(!content_type) {
        return null;
    }

    try {
        content_type = content_type.toLowerCase();
    } catch(e) {
        return null;
    }

    if(content_type.indexOf('.jpg') > -1) {
        return 'image/jpeg';
    }

    if(content_type.indexOf('.jpeg') > -1) {
        return 'image/jpeg';
    }

    if(content_type.indexOf('.png') > -1) {
        return 'image/png';
    }

    return null;
}

function uploadS3Key(bucket, key, local_output, buffer, mime) {
    return new Promise(async (resolve, reject) => {
        const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        let file_stream;

        if (local_output) {
            file_stream = fs.createReadStream(local_output);
        } else if (buffer) {
            file_stream = buffer;
        }

        const params = {
            Bucket: bucket,
            Key: key,
            Body: file_stream,
            ACL: 'public-read',
            ContentType: mime ? mime : getContentType(local_output)
        };

        try {
            const command = new PutObjectCommand(params);
            await s3Client.send(command);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function useKM() {
    let value = process.env.DISPLAY_KM;

    return value && (value === 'true' || value === '1');
}

function writeFile(file_path, data) {
    return new Promise(async (resolve, reject) => {
        fs.writeFile(file_path, data, (err) => {
            if (err) {
                console.error(err);
                return reject(err);
            } else {
                resolve();
            }
        });
    });
}

let mdpTiming = {};

function mdp(key) {
    mdpTiming[key] = {
        start: timeNow(),
    };
}

function mdpe(key) {
    if (!(key in mdpTiming)) {
        return;
    }

    let t = timeNow() - mdpTiming[key].start;

    let obj = {};

    obj[key] = t;

    console.info(obj);
}

module.exports = {
    earth_radius_km,
    km_per_degree_lat,
    kms_per_mile,
    birthDatePure,
    calculateAge,
    calculateDistanceFeet,
    calculateDistanceMeters,
    changeTimezone,
    cloneObj,
    dataEndpoint,
    dateTimeNow,
    deleteFile,
    downloadURL,
    floatOrNull,
    formatNumberLength,
    formatObjectTypes,
    generateOTP,
    generateToken,
    getBicyclingTime,
    getCityState,
    getCleanDomain,
    getCoordsBoundBox,
    getCoordsFromPointDistance,
    getDateDiff,
    getDateStr,
    getDateTimeStr,
    getDistanceMilesOrKM,
    getIPAddr,
    getLocalDate,
    getLocalDateStr,
    getLocalDateTimeStr,
    getMetersFromMilesOrKm,
    getMilesOrKmFromMeters,
    getOptionDateTime,
    getRandomInRange,
    getRepoRoot,
    getReverseClientURLScheme,
    getStatesList,
    getTimeFromSeconds,
    getTimeZoneFromCoords,
    getWalkingTime,
    getURL,
    hasPort,
    isLatValid,
    isLonValid,
    isLocalApp,
    isLocalHost,
    isNumeric,
    isProdApp,
    isIPAddress,
    isObject,
    isValidBase64Image,
    isValidEmail,
    isValidPhone,
    isValidUserName,
    joinPaths,
    latLonLookup,
    loadScriptEnv,
    mdp,
    mdpe,
    normalizeDistance,
    normalizePort,
    normalizeSearch,
    numberWithCommas,
    pathExists,
    range,
    readFile,
    removeArrItem,
    sanitizePrivateKey,
    saveFile,
    sendEmail,
    shuffleFunc,
    slugName,
    stringDistance,
    timeNow,
    timeoutAwait,
    uploadS3Key,
    useKM,
    writeFile,
};
