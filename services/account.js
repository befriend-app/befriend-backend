const cacheService = require('./cache');
const dbService = require('./db');
const { country_codes, sendCode } = require('./sms');
const { isValidPhone, isValidEmail, generateToken, timeNow, generateOTP, sendEmail } = require('./shared');
const { getPerson } = require('./persons');
const encryptionService = require('./encryption');

module.exports = {
    authCodes: {
        expiration: 30 * 60 * 1000, //ms
        threshold: {
            sms: 20000, //ms,
            email: 5000 //ms
        }
    },
    doLogin: function (email, password) {
        return new Promise(async (resolve, reject) => {
            try {
                let person = await getPerson(null, email);

                // check if password is correct
                let validPassword = await encryptionService.compare(password, person.password);

                if (!validPassword) {
                    return reject({
                        message: 'Invalid login',
                        status: 403
                    });
                }

                // generate login token return in response. Used for authentication on future requests
                let login_token = generateToken(30);

                // save to both mysql and redis
                let conn = await dbService.conn();

                await conn('persons_login_tokens').insert({
                    person_id: person.id,
                    login_token: login_token,
                    expires: null,
                    created: timeNow(),
                    updated: timeNow(),
                });

                let cache_key = cacheService.keys.person_login_tokens(person.person_token);

                await cacheService.addItemToSet(cache_key, login_token);

                resolve(login_token);
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    doLogout: function (person_token, login_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof person_token !== 'string' || typeof login_token !== 'string') {
                    return reject();
                }

                let conn = await dbService.conn();

                let person = await getPerson(person_token);

                let updated = await conn('persons_login_tokens')
                    .where('person_id', person.id)
                    .where('login_token', login_token)
                    .update({
                        updated: timeNow(),
                        deleted: timeNow()
                    });

                let cache_key = cacheService.keys.person_login_tokens(person_token);

                await cacheService.removeMemberFromSet(cache_key, login_token);

                resolve();
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    isAuthenticated: function (person_token, login_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!person_token) {
                    return resolve(false);
                }

                let cache_key = cacheService.keys.person_login_tokens(person_token);

                let is_valid_token = await cacheService.isSetMember(cache_key, login_token);

                return resolve(is_valid_token);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    checkAccountExists: function (phoneObj, email) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();

                //validate
                if(!phoneObj && !email){
                    return reject({
                        message: 'Invalid request'
                    })
                }

                if(phoneObj){
                    if(typeof phoneObj !== 'object') {
                        return reject({
                            message: 'Invalid data'
                        });
                    } else if(typeof phoneObj.countryCode !== 'string' || typeof phoneObj.number !== 'string'){
                        return reject({
                            message: 'Invalid data'
                        });
                    }
                }

                if(email && typeof email !== 'string'){
                    return reject({
                        message: 'Invalid data'
                    })
                }

                if(phoneObj) {
                    if(!country_codes.includes(phoneObj.countryCode)) {
                        return reject({
                            message: 'Invalid country code'
                        })
                    }

                    if(!isValidPhone(phoneObj.number, phoneObj.countryCode)) {
                        return reject({
                            message: 'Invalid phone number'
                        });
                    }
                }

                if(email && !isValidEmail(email)) {
                    return reject({
                        message: 'Invalid email'
                    });
                }

                if(phoneObj) {
                    let phone = phoneObj.number.replace(/\D/g, '');

                    let qry = await conn('persons')
                        .where('phone', phone)
                        .where('phone_country_code', phoneObj.countryCode)
                        .first();

                    return resolve(!!qry);
                }

                if(email) {
                    let qry = await conn('persons')
                        .where('email', email)
                        .first();

                    return resolve(!!qry);
                }

                return reject({
                    message: 'Invalid request'
                });
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    sendAuthCode: function (phoneObj, email, action = '') {
        return new Promise(async (resolve, reject) => {
            if(!['signup', 'login'].includes(action)){
                return reject({
                    message: 'Invalid action'
                });
            }

            try {
                let conn = await dbService.conn();

                //data already validated in checkAccountExists
                if(phoneObj){
                    let phoneStr = `${phoneObj.countryCode}${phoneObj.number}`;

                    //prevent sending too often
                    let mostRecent = await conn('auth_codes')
                        .where('phone', phoneStr)
                        .orderBy('id', 'desc')
                        .first();

                    if(mostRecent && timeNow() - mostRecent.created < module.exports.authCodes.threshold.sms) {
                        let ms = module.exports.authCodes.threshold.sms - (timeNow() - mostRecent.created);
                        let sec = (ms / 1000).toFixed(0);

                        return reject({
                            message: `Please wait ${sec} sec${sec > 1 ? 's': ''} before requesting a new code`
                        });
                    }

                    let code = generateOTP(6);

                    await sendCode(phoneStr, code);

                    await conn('auth_codes')
                        .insert({
                            phone: phoneStr,
                            code,
                            action,
                            created: timeNow(),
                            updated: timeNow()
                        });

                    return resolve();
                } else if(email) {
                    //prevent sending too often
                    let mostRecent = await conn('auth_codes')
                        .where('email', email)
                        .orderBy('id', 'desc')
                        .first();

                    if(mostRecent && timeNow() - mostRecent.created < module.exports.authCodes.threshold.email) {
                        let ms = module.exports.authCodes.threshold.email - (timeNow() - mostRecent.created);
                        let sec = (ms / 1000).toFixed(0);

                        return reject({
                            message: `Please wait ${sec} sec${sec > 1 ? 's': ''} before requesting a new code`
                        });
                    }

                    let code = generateOTP(6);

                    let action_str = action === 'signup' ? 'sign up' : action;

                    let html = `<div style="font-size: 13px;">Enter the following code to ${action_str} ${action === 'signup' ? 'for' : 'to'} ${process.env.NETWORK_NAME}:</div>
                                <div style="font-size: 18px; margin-top: 20px;">${code}</div>`;

                    await sendEmail(`Your ${action === 'signup' ? 'sign-up' : action} code is ${code}`, html, email);

                    await conn('auth_codes')
                        .insert({
                            email: email,
                            code,
                            action,
                            created: timeNow(),
                            updated: timeNow()
                        });
                }

                resolve();
            } catch(e) {
                console.error(e);
                return reject({
                    message: 'Error sending code'
                });
            }
        });
    },
}