const axios = require("axios");
const dbService = require("../services/db");
const fs = require("fs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const geoip = require("geoip-lite");
const geolib = require("geolib");
const geoplaces = require("geojson-places");
const tldts = require("tldts");
const process = require("process");
const sgMail = require("@sendgrid/mail");
const { decrypt } = require("./encryption");
const bcrypt = require("bcryptjs");
const _ = require("lodash");

dayjs.extend(utc);
dayjs.extend(timezone);

global.serverTimezoneString = process.env.TZ || "America/Chicago";

const meters_to_miles = 0.000621371192;

Object.defineProperty(String.prototype, "capitalize", {
    value: function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    },
    enumerable: false,
});

function birthDatePure(birth_date) {
    if (!birth_date) {
        return null;
    }

    return birth_date.substring(0, 10);
}

function changeTimezone(date, ianatz) {
    let invdate = new Date(
        date.toLocaleString("en-US", {
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

function confirmDecryptedNetworkToken(encrypted_message, network) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            //get secret key for encrypted message
            let secret_key_qry = await conn("networks_secret_keys")
                .where("network_id", network.id)
                .where("is_active", true)
                .first();

            if (!secret_key_qry) {
                return reject("Error validating network");
            }

            //ensure can decrypt message and it matches my network token
            let decoded = await decrypt(secret_key_qry.secret_key_from, encrypted_message);

            if (!decoded || decoded !== network.network_token) {
                return reject("Invalid network_token");
            }

            resolve(true);
        } catch (e) {
            return reject("Error decrypting message");
        }
    });
}

function confirmDecryptedRegistrationNetworkToken(encrypted_message) {
    return new Promise(async (resolve, reject) => {
        try {
            let networkService = require("../services/network");

            let conn = await dbService.conn();

            let my_network = await networkService.getNetworkSelf();

            if (!my_network || !my_network.registration_network_id) {
                return reject("Error finding my registration network");
            }

            //get secret key for the registration network
            let secret_key_qry = await conn("networks_secret_keys")
                .where("network_id", my_network.registration_network_id)
                .where("is_active", true)
                .first();

            if (!secret_key_qry) {
                return reject("Error finding keys");
            }

            //ensure can decrypt message and it matches my network token
            let decoded = await decrypt(secret_key_qry.secret_key_from, encrypted_message);

            if (!decoded || decoded !== networkService.token) {
                return reject("Invalid keys exchange request");
            }

            resolve(true);
        } catch (e) {
            return reject("Error decrypting message");
        }
    });
}

function dateTimeNow(date) {
    if (!date) {
        date = new Date();
    }

    return date.toISOString().slice(0, 10) + " " + date.toISOString().substring(11, 19);
}

function downloadURL(url, output_path) {
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axios({
                method: "get",
                url: url,
                responseType: "stream",
                headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache",
                    Expires: "0",
                },
            });

            let w = fs.createWriteStream(output_path);

            response.data.pipe(w);

            w.on("finish", function () {
                resolve();
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function encodePassword(unencrypted_password) {
    return new Promise(async (resolve, reject) => {
        bcrypt.genSalt(10, function (err, salt) {
            bcrypt.hash(unencrypted_password, salt, function (err, hash) {
                if (err) {
                    reject(err);
                } else {
                    resolve(hash);
                }
            });
        });
    });
}

function formatNumberLength(num, length) {
    let r = "" + num;

    while (r.length < length) {
        r = "0" + r;
    }
    return r;
}

function generateToken(length) {
    if (!length) {
        length = 32;
    }

    //edit the token allowed characters
    let a = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
    let b = [];

    for (let i = 0; i < length; i++) {
        let j = (Math.random() * (a.length - 1)).toFixed(0);
        b[i] = a[j];
    }

    return b.join("");
}

function getCityState(zip, blnUSA = true) {
    return new Promise(async (resolve, reject) => {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?components=country:US|postal_code:${zip}&key=${process.env.GMAPS_KEY}`;

        try {
            let address_info = await axios.get(url);
        } catch (e) {
            return reject(e);
        }

        let city = "";
        let state = "";
        let country = "";

        let data = address_info.data;

        if (data.results && data.results.length) {
            for (let component of data.results[0].address_components) {
                let type = component.types[0];

                if ((city === "" && type === "sublocality_level_1") || type === "locality") {
                    city = component.short_name.trim();
                }

                if (state === "" && type === "administrative_area_level_1") {
                    state = component.short_name.trim();
                }

                if (country === "" && type === "country") {
                    country = component.short_name.trim();

                    if (blnUSA && country !== "US") {
                        city = "";
                        state = "";
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

    if (typeof domain !== "string") {
        throw Error("Domain should be a string");
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
        clean_domain = clean_domain.replace("https://", "").replace("http://", "");
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

    if (radLat < latLimits[0] || radLat > latLimits[1] || radLon < lonLimits[0] || radLon > lonLimits[1]) {
        throw new Error("Invalid Argument");
    }

    // Angular distance in radians on a great circle,
    let angular;

    if (useKM()) {
        angular = distance_miles_or_km / 6371;
    } else {
        angular = distance_miles_or_km / 3958.762079;
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

function getDateDiff(date_1, date_2, unit) {
    let dayjs = require("dayjs");

    date_1 = dayjs(date_1);
    date_2 = dayjs(date_2);

    return date_1.diff(date_2, unit);
}

function getDateStr(date) {
    let dayjs = require("dayjs");
    let obj = dayjs(date);
    return obj.format("YYYY-MM-DD");
}

function getDateTimeStr() {
    let date = new Date();
    return date.toISOString().slice(0, 10) + " " + date.toISOString().substring(11, 19);
}

function getDistanceMeters(loc_1, loc_2) {
    const R = 6371; // Earth's radius in km

    const dLat = deg2rad(loc_2.lat - loc_1.lat);
    const dLon = deg2rad(loc_2.lon - loc_1.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((loc_1.lat * Math.PI) / 180) *
            Math.cos((loc_1.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c * 1000;
}

function getExchangeKeysKey(token) {
    return `networks:keys:exchange:${token}`;
}

function getIPAddr(req) {
    return req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
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
    let str = `${isoString.slice(0, -1)}${offset > 0 ? "-" : "+"}${String(Math.floor(offsetAbs / 60)).padStart(2, "0")}:${String(offsetAbs % 60).padStart(2, "0")}`;
    str = str.replace("T", " ").substring(0, 19);
    return str;
}

function getLocalDateTimeStr(date) {
    if (!date) {
        date = new Date();
    }

    let dayjs = require("dayjs");

    dayjs = dayjs(date);

    return dayjs.format("MM-DD-YY HH:mm:ss");
}

function getMetersFromMilesOrKm(miles_or_km, to_int) {
    let meters;

    if (useKM()) {
        meters = miles_or_km * 1000;
    } else {
        meters = miles_or_km / meters_to_miles;
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
        return meters * meters_to_miles;
    }
}

function getPersonCacheKey(person_token_or_email) {
    if (!person_token_or_email) {
        throw new Error("No person_token or email provided");
    }

    person_token_or_email = person_token_or_email.toLowerCase();

    return `persons:${person_token_or_email}`;
}

function getPersonLoginCacheKey(person_token) {
    //set

    if (!person_token) {
        throw new Error("No person_token provided");
    }

    person_token = person_token.toLowerCase();

    return `persons:${person_token}:login_tokens`;
}

function getRandomInRange(from, to, fixed) {
    return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
}

function getRepoRoot() {
    let slash = `/`;

    if (process.platform.startsWith("win")) {
        slash = `\\`;
    }

    let path_split = __dirname.split(slash);

    let path_split_slice = path_split.slice(0, path_split.length - 1);

    return path_split_slice.join(slash);
}

function getStatesList() {
    return {
        AL: "Alabama",
        AK: "Alaska",
        AZ: "Arizona",
        AR: "Arkansas",
        CA: "California",
        CO: "Colorado",
        CT: "Connecticut",
        DE: "Delaware",
        DC: "District Of Columbia",
        FL: "Florida",
        GA: "Georgia",
        HI: "Hawaii",
        ID: "Idaho",
        IL: "Illinois",
        IN: "Indiana",
        IA: "Iowa",
        KS: "Kansas",
        KY: "Kentucky",
        LA: "Louisiana",
        ME: "Maine",
        MD: "Maryland",
        MA: "Massachusetts",
        MI: "Michigan",
        MN: "Minnesota",
        MS: "Mississippi",
        MO: "Missouri",
        MT: "Montana",
        NE: "Nebraska",
        NV: "Nevada",
        NH: "New Hampshire",
        NJ: "New Jersey",
        NM: "New Mexico",
        NY: "New York",
        NC: "North Carolina",
        ND: "North Dakota",
        OH: "Ohio",
        OK: "Oklahoma",
        OR: "Oregon",
        PA: "Pennsylvania",
        PR: "Puerto Rico",
        RI: "Rhode Island",
        SC: "South Carolina",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        UT: "Utah",
        VT: "Vermont",
        VA: "Virginia",
        WA: "Washington",
        WV: "West Virginia",
        WI: "Wisconsin",
        WY: "Wyoming",
    };
}

function getSessionKey(session) {
    return `session:api:${session}`;
}

function getTimeZoneFromCoords(lat, lon) {
    const { find } = require("geo-tz");

    let tz = find(lat, lon);

    if (tz && tz.length) {
        return tz[0];
    }
}

function getURL(raw_domain, endpoint) {
    if (!raw_domain) {
        throw new Error("Domain required");
    }

    if (typeof endpoint === "undefined") {
        throw new Error("No endpoint provided");
    }

    //use provided protocol for dev
    if (!isProdApp()) {
        if (isIPAddress(raw_domain) || isLocalHost(raw_domain)) {
            // use http if only ip/localhost string
            if (raw_domain.startsWith("http")) {
                return joinPaths(raw_domain, endpoint);
            }

            return joinPaths(`http://${raw_domain}`, endpoint);
        }
    }

    if (raw_domain.startsWith("http")) {
        return joinPaths(raw_domain, endpoint);
    }

    return joinPaths(`https://${raw_domain}`, endpoint);
}

function hasPort(domain) {
    if (!domain) {
        return false;
    }

    let pure_domain = getCleanDomain(domain);

    let split = pure_domain.split(":");

    return split.length > 1;
}

function isIPAddress(address) {
    if (!address || typeof address !== "string") {
        return false;
    }

    //remove https, http
    address = address.replace("https://", "").replace("http://", "");

    //remove port
    let domain_no_port = address.split(":")[0];
    let ip_re = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return !!domain_no_port.match(ip_re);
}

function isLocalHost(address) {
    if (!address) {
        return false;
    }

    if (typeof address !== "string") {
        throw "Address is not a string";
    }

    let domain = address.toLowerCase();

    domain = domain.replace("https://", "").replace("http://", "");

    let parsed = tldts.parse(domain);

    return parsed.publicSuffix && parsed.publicSuffix === "localhost";
}

function isLocalApp() {
    return process.env.APP_ENV.includes("local");
}

function isNumeric(val) {
    return !isNaN(parseFloat(val)) && isFinite(val);
}

function isProdApp() {
    return process.env.APP_ENV && process.env.APP_ENV.includes("prod");
}

function isValidEmail(email) {
    let re =
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

function isValidUserName(username) {
    const valid = /^[a-z0-9_\.]+$/.exec(username);
    return valid;
}

function joinPaths() {
    let args = [];

    for (let i = 0; i < arguments.length; i++) {
        let arg = arguments[i] + "";
        if (!arg) {
            continue;
        }

        if (typeof arg === "number") {
            arg = arg.toString();
        }

        args.push(arg);
    }

    let slash = "/";

    if (process.platform === "win32" && args[0].includes("\\")) {
        slash = "\\";
    }

    let url = args
        .map((part, i) => {
            if (i === 0) {
                let re = new RegExp(`[\\${slash}]*$`, "g");
                return part.trim().replace(re, "");
            } else {
                let re = new RegExp(`(^[\\${slash}]*|[\\/]*$)`, "g");
                return part.trim().replace(re, "");
            }
        })
        .filter((x) => x.length)
        .join(slash);

    if (!url.startsWith("http") && !url.startsWith("/")) {
        url = `/${url}`;
    }

    return url;
}

function latLonLookup(lat, lon) {
    if (!lat || !lon) {
        return null;
    }

    return geoplaces.lookUp(lat, lon);
}

function loadScriptEnv() {
    let repo_root = getRepoRoot();

    process.chdir(repo_root);

    require("dotenv").config();
}

function normalizeDistance(distance, radius_meters) {
    return 1 - Math.min(distance / radius_meters, 1);
}

function normalizePort(val) {
    let port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
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
    clean_search = clean_search.trim().replace(/\s+/g, " ");

    //remove non-allowed characters
    let regex = /[^a-zA-Z0-9 ,.'-]+/;

    clean_search = clean_search.replace(regex, "");

    return clean_search;
}

function numberWithCommas(x, to_integer) {
    if (!x) {
        return x;
    }

    if (to_integer) {
        x = Number.parseInt(x);
    }

    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
        require("fs").readFile(p, function (err, data) {
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

function sendEmail(subject, html, email, from, cc, attachment_alt) {
    return new Promise(async (resolve, reject) => {
        if (!from) {
            from = process.env.EMAIL_FROM;
        }

        const sgMail = require("@sendgrid/mail");

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

function setSystemProcessRan(system_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let qry = await conn("system").where("system_key", system_key).first();

            if (qry) {
                await conn("system").where("id", qry.id).update({
                    updated: timeNow(),
                });
            } else {
                await conn("system").insert({
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
    return require("slugify")(name, {
        lower: true,
        strict: true,
    });
}

function systemProcessRan(system_key) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let qry = await conn("system").where("system_key", system_key).first();

            if (!qry || !qry.system_value) {
                return resolve(false);
            }

            let value = qry.system_value.toLowerCase();

            if (value === "true") {
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

function useKM() {
    let value = process.env.DISPLAY_KM;

    return value && (value === "true" || value === "1");
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

module.exports = {
    birthDatePure: birthDatePure,
    changeTimezone: changeTimezone,
    confirmDecryptedNetworkToken: confirmDecryptedNetworkToken,
    confirmDecryptedRegistrationNetworkToken: confirmDecryptedRegistrationNetworkToken,
    cloneObj: cloneObj,
    dateTimeNow: dateTimeNow,
    downloadURL: downloadURL,
    encodePassword: encodePassword,
    formatNumberLength: formatNumberLength,
    generateToken: generateToken,
    getCityState: getCityState,
    getCleanDomain: getCleanDomain,
    getCoordsBoundBox: getCoordsBoundBox,
    getDateDiff: getDateDiff,
    getDateStr: getDateStr,
    getDateTimeStr: getDateTimeStr,
    getDistanceMeters: getDistanceMeters,
    getExchangeKeysKey: getExchangeKeysKey,
    getIPAddr: getIPAddr,
    getLocalDate: getLocalDate,
    getLocalDateStr: getLocalDateStr,
    getLocalDateTimeStr: getLocalDateTimeStr,
    getMetersFromMilesOrKm: getMetersFromMilesOrKm,
    getMilesOrKmFromMeters: getMilesOrKmFromMeters,
    getPersonCacheKey: getPersonCacheKey,
    getPersonLoginCacheKey: getPersonLoginCacheKey,
    getRandomInRange: getRandomInRange,
    getRepoRoot: getRepoRoot,
    getStatesList: getStatesList,
    getSessionKey: getSessionKey,
    getTimeZoneFromCoords: getTimeZoneFromCoords,
    getURL: getURL,
    hasPort: hasPort,
    isLocalApp: isLocalApp,
    isLocalHost: isLocalHost,
    isNumeric: isNumeric,
    isProdApp: isProdApp,
    isIPAddress: isIPAddress,
    isValidEmail: isValidEmail,
    isValidUserName: isValidUserName,
    joinPaths: joinPaths,
    latLonLookup: latLonLookup,
    loadScriptEnv: loadScriptEnv,
    normalizeDistance: normalizeDistance,
    normalizePort: normalizePort,
    normalizeSearch: normalizeSearch,
    numberWithCommas: numberWithCommas,
    range: range,
    readFile: readFile,
    sendEmail: sendEmail,
    setSystemProcessRan: setSystemProcessRan,
    shuffleFunc: shuffleFunc,
    slugName: slugName,
    systemProcessRan: systemProcessRan,
    timeNow: timeNow,
    timeoutAwait: timeoutAwait,
    useKM: useKM,
    writeFile: writeFile,
};
