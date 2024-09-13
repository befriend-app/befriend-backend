const axios = require('axios');
const dbService = require('../services/db');
const fs = require("fs");
const dayjs = require("dayjs");
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const geoip = require('geoip-lite');
const geolib = require('geolib');
const tldts = require('tldts');
const process = require("process");
const sgMail = require("@sendgrid/mail");
const {getDomain} = require("tldts");

dayjs.extend(utc);
dayjs.extend(timezone);

global.serverTimezoneString = process.env.TZ || 'America/Chicago';

Object.defineProperty(String.prototype, 'capitalize', {
    value: function() {
        return this.charAt(0).toUpperCase() + this.slice(1);
    },
    enumerable: false
});

function changeTimezone(date, ianatz) {
    let invdate = new Date(date.toLocaleString('en-US', {
        timeZone: ianatz
    }));

    let diff = date.getTime() - invdate.getTime();

    return new Date(date.getTime() - diff);
}

function cloneObj(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch(e) {
        console.error(e);
        return null;
    }
}

function dateTimeNow(date) {
    if(!date) {
        date = new Date();
    }

    return date.toISOString().slice(0,10) + ' ' + date.toISOString().substring(11, 19);
}

function downloadURL(url, output_path) {
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axios({
                method: "get",
                url: url,
                responseType: "stream",
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });

            let w = fs.createWriteStream(output_path);

            response.data.pipe(w);

            w.on('finish', function () {
                resolve();
            });
        } catch(e) {
            console.error(e);
            return reject(e);
        }

    });
}

function formatNumberLength(num, length) {
    let r = "" + num;

    while(r.length < length) {
        r = "0" + r;
    }
    return r;
}

function generateToken(length) {
    if(!length) {
        length = 32;
    }

    //edit the token allowed characters
    let a = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
    let b = [];

    for (let i= 0; i < length; i++) {
        let j = (Math.random() * (a.length-1)).toFixed(0);
        b[i] = a[j];
    }

    return b.join("");
}

function getCityState(zip, blnUSA = true) {
    return new Promise(async (resolve, reject) => {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?components=country:US|postal_code:${zip}&key=${process.env.GMAPS_KEY}`;


        try {
            let address_info = await axios.get(url);
        } catch(e) {
            return reject(e);
        }

        let city = "";
        let state = "";
        let country = "";

        let data = address_info.data;

        if(data.results && data.results.length) {
            for(let component of data.results[0].address_components) {
                let type = component.types[0];

                if(city === "" && (type === 'sublocality_level_1') || type === 'locality') {
                    city = component.short_name.trim();
                }

                if(state === "" && type === 'administrative_area_level_1') {
                    state = component.short_name.trim();
                }

                if(country === '' && type === 'country') {
                    country = component.short_name.trim();

                    if(blnUSA && country !== 'US') {
                        city = "";
                        state = "";
                        break;
                    }
                }

                if(city && state && country) {
                    break;
                }
            }
        }

        return resolve({
            city: city,
            state: state,
            zip: zip,
            country: country
        })
    });
}

function getCleanDomain(domain, remove_subdomain) {
    if(!domain) {
        return null;
    }

    if(typeof domain !== "string") {
        throw Error("Domain should be a string");
    }

    //lowercase
    let clean_domain = domain.toLowerCase();

    //remove http, https
    if(!isIPAddress(clean_domain)) {
        clean_domain = clean_domain.replace('https://', '').replace('http://', '');
    }

    if(remove_subdomain) {
        if(!isIPAddress(clean_domain)) {
            clean_domain = tldts.parse(clean_domain).domain;
        }
    }

    return clean_domain;
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

function getIPAddr(req) {
    return req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        null;
}

function getLocalDate() {
    return getLocalDateStr(changeTimezone(new Date(), serverTimezoneString));
}

function getLocalDateStr(date) {
    if(!date) {
        date = new Date();
    }

    const offset = date.getTimezoneOffset()
    const offsetAbs = Math.abs(offset)
    const isoString = new Date(date.getTime() - offset * 60 * 1000).toISOString()
    let str = `${isoString.slice(0, -1)}${offset > 0 ? '-' : '+'}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`;
    str = str.replace('T', ' ').substring(0, 19);
    return str;
}

function getLocalDateTimeStr(date) {
    if(!date) {
        date = new Date();
    }

    let dayjs = require('dayjs');

    dayjs = dayjs(date);

    return dayjs.format('MM-DD-YY HH:mm:ss');
}

function getMilesFromMeters(meters) {
    return meters * 0.000621371192;
}

function getRepoRoot() {
    let slash = `/`;

    if(process.platform.startsWith('win')) {
        slash = `\\`;
    }

    let path_split = __dirname.split(slash);

    let path_split_slice = path_split.slice(0, path_split.length - 1);

    return path_split_slice.join(slash);
}

function getStatesList() {
    return {
        'AL':"Alabama",
        'AK':"Alaska",
        'AZ':"Arizona",
        'AR':"Arkansas",
        'CA':"California",
        'CO':"Colorado",
        'CT':"Connecticut",
        'DE':"Delaware",
        'DC':"District Of Columbia",
        'FL':"Florida",
        'GA':"Georgia",
        'HI':"Hawaii",
        'ID':"Idaho",
        'IL':"Illinois",
        'IN':"Indiana",
        'IA':"Iowa",
        'KS':"Kansas",
        'KY':"Kentucky",
        'LA':"Louisiana",
        'ME':"Maine",
        'MD':"Maryland",
        'MA':"Massachusetts",
        'MI':"Michigan",
        'MN':"Minnesota",
        'MS':"Mississippi",
        'MO':"Missouri",
        'MT':"Montana",
        'NE':"Nebraska",
        'NV':"Nevada",
        'NH':"New Hampshire",
        'NJ':"New Jersey",
        'NM':"New Mexico",
        'NY':"New York",
        'NC':"North Carolina",
        'ND':"North Dakota",
        'OH':"Ohio",
        'OK':"Oklahoma",
        'OR':"Oregon",
        'PA':"Pennsylvania",
        'PR':"Puerto Rico",
        'RI':"Rhode Island",
        'SC':"South Carolina",
        'SD':"South Dakota",
        'TN':"Tennessee",
        'TX':"Texas",
        'UT':"Utah",
        'VT':"Vermont",
        'VA':"Virginia",
        'WA':"Washington",
        'WV':"West Virginia",
        'WI':"Wisconsin",
        'WY':"Wyoming"
    }
}

function getSessionKey(session) {
    return `session:api:${session}`;
}

function getURL(raw_domain, endpoint) {
    if(isIPAddress(raw_domain)) {
        return joinPaths(raw_domain, endpoint);
    }

    return joinPaths(`https://${raw_domain}`, endpoint);
}

function hasPort(domain) {
    if(!domain) {
        return false;
    }

    let pure_domain = getCleanDomain(domain);

    let split = pure_domain.split(':');

    return split.length > 1;
}

function isIPAddress(address) {
    if(!address || typeof address !== 'string') {
        return false;
    }

    //remove https, http
    address = address.replace('https://', '').replace('http://', '');

    //remove port
    let domain_no_port = address.split(':')[0];
    let ip_re = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return !!domain_no_port.match(ip_re);
}

function isLocalApp() {
    return process.env.APP_ENV.includes('local');
}

function isNumeric(val) {
    return !isNaN( parseFloat(val) ) && isFinite( val );
}

function isProdApp() {
    return process.env.APP_ENV && process.env.APP_ENV.includes('prod');
}

function isValidEmail(email) {
    let re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

function isValidUserName(username) {
    const valid = /^[a-z0-9_\.]+$/.exec(username);
    return valid;
}

function joinPaths() {
    let args = [];

    for (let i = 0; i < arguments.length; i++) {
        let arg = arguments[i] + '';
        if(!arg) {
            continue;
        }

        if(typeof arg === 'number') {
            arg = arg.toString();
        }

        args.push(arg);
    }

    let slash = '/';

    if(process.platform === 'win32' && args[0].includes('\\')) {
        slash = '\\';
    }

    let url = args.map((part, i) => {
        if (i === 0) {
            let re = new RegExp(`[\\${slash}]*$`, 'g');
            return part.trim().replace(re, '')
        } else {
            let re = new RegExp(`(^[\\${slash}]*|[\\/]*$)`, 'g');
            return part.trim().replace(re, '')
        }
    }).filter(x=>x.length).join(slash);

    if(!url.startsWith('http') && !url.startsWith('/')) {
        url = `/${url}`;
    }

    return url;
}

function loadScriptEnv() {
    let repo_root = getRepoRoot();

    process.chdir(repo_root);

    require('dotenv').config();
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

function numberWithCommas(x, to_integer) {
    if(!x) {
        return x;
    }

    if(to_integer) {
        x = Number.parseInt(x);
    }
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function readFile(p, json) {
    return new Promise((resolve, reject) => {
        require('fs').readFile(p, function (err, data) {
            if(err) {
                return reject(err);
            }

            if(data) {
                data = data.toString();
            }

            if(json) {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return reject(e);
                }
            }

            return resolve(data);
        });
    })
}

function sendEmail(subject, html, email, from, cc, attachment_alt) {
    return new Promise(async(resolve, reject) => {
        if(!from) {
            from = process.env.EMAIL_FROM;
        }

        const sgMail = require('@sendgrid/mail');

        sgMail.setApiKey(process.env.SENDGRID_KEY);

        let sendMsg = {
            trackingSettings: {
                clickTracking: {
                    enable: false,
                    enableText: false
                }
            },
            to: email,
            from: from,
            subject: subject,
            html: html
        };

        try {
            await sgMail.send(sendMsg);
        } catch(e) {
            console.error(e);
            return reject(e);
        }

        if(cc) {
            try {
                let cc_message = sendMsg;
                cc_message.to = process.env.EMAIL_FROM;
                await sgMail.send(cc_message);
            } catch(e) {
                console.error(e);
            }
        }

        return resolve();
    });
}

function shuffleFunc(array){
    let currentIndex = array.length, temporaryValue, randomIndex;

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
        strict: true
    });
}

function timeNow(seconds) {
    if(seconds) {
        return Number.parseInt(Date.now() / 1000);
    }

    return Date.now();
}

function timeoutAwait(ms, f) {
    return new Promise(async (resolve, reject) => {
        setTimeout(function () {
            if(f) {
                f();
            }

            resolve();
        }, ms);
    });
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
    changeTimezone: changeTimezone,
    cloneObj: cloneObj,
    dateTimeNow: dateTimeNow,
    downloadURL: downloadURL,
    formatNumberLength: formatNumberLength,
    generateToken: generateToken,
    getCityState: getCityState,
    getCleanDomain: getCleanDomain,
    getDateDiff: getDateDiff,
    getDateStr: getDateStr,
    getDateTimeStr: getDateTimeStr,
    getIPAddr: getIPAddr,
    getLocalDate: getLocalDate,
    getLocalDateStr: getLocalDateStr,
    getLocalDateTimeStr: getLocalDateTimeStr,
    getMilesFromMeters: getMilesFromMeters,
    getRepoRoot: getRepoRoot,
    getStatesList: getStatesList,
    getSessionKey: getSessionKey,
    getURL: getURL,
    hasPort: hasPort,
    isLocalApp: isLocalApp,
    isNumeric: isNumeric,
    isProdApp: isProdApp,
    isIPAddress: isIPAddress,
    isValidEmail: isValidEmail,
    isValidUserName: isValidUserName,
    joinPaths: joinPaths,
    loadScriptEnv: loadScriptEnv,
    normalizePort: normalizePort,
    numberWithCommas: numberWithCommas,
    readFile: readFile,
    sendEmail: sendEmail,
    shuffleFunc: shuffleFunc,
    slugName: slugName,
    timeNow: timeNow,
    timeoutAwait: timeoutAwait,
    writeFile: writeFile

}