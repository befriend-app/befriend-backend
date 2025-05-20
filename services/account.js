const cacheService = require('./cache');
const dbService = require('./db');
const { country_codes, sendCode } = require('./sms');
const { isValidPhone, isValidEmail, generateToken, timeNow, generateOTP, sendEmail } = require('./shared');
const encryptionService = require('./encryption');
const { batchUpdate } = require('./db');

module.exports = {
    password: {
        minChars: 8
    },
    authCodes: {
        actions: ['signup', 'login', 'password'],
        maxTries: 3,
        expiration: 30 * 60, //sec
        threshold: {
            sms: 20, //sec,
            email: 5 //sec
        }
    },
    loginEmail: function (email, password) {
        return new Promise(async (resolve, reject) => {
            try {
                let person = await require('./persons').getPerson(null, email);

                // check if password is correct
                let validPassword = await encryptionService.compare(password, person.password);

                if (!validPassword) {
                    return reject({
                        message: 'Invalid login',
                        status: 403
                    });
                }

                let login_token = await module.exports.createLoginToken(person);

                resolve({
                    person_token: person.person_token,
                    login_token
                });
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    createLoginToken: function (person) {
        return new Promise(async (resolve, reject) => {
            try {
                // Generate login token for response. Used for authentication on future requests and stored in local storage.
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
    logoutUser: function (person_token, login_token) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof person_token !== 'string' || typeof login_token !== 'string') {
                    return reject();
                }

                let conn = await dbService.conn();

                let person = await require('./persons').getPerson(person_token);

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
    validatePhoneEmail: function (phoneObj, email) {
        //validate
        if(!phoneObj && !email){
            throw new Error('Invalid request');
        }

        if(phoneObj){
            if(typeof phoneObj !== 'object') {
                throw new Error('Invalid data');
            } else if(typeof phoneObj.countryCode !== 'string' || typeof phoneObj.number !== 'string'){
                throw new Error('Invalid data');
            }
        }

        if(email && typeof email !== 'string'){
            throw new Error('Invalid data');
        }

        if(phoneObj) {
            if(!country_codes.includes(phoneObj.countryCode)) {
                throw new Error('Invalid country code');
            }

            if(!isValidPhone(phoneObj.number, phoneObj.countryCode)) {
                throw new Error('Invalid phone number');
            }
        }

        if(email && !isValidEmail(email)) {
            throw new Error('Invalid email');
        }

        return true;
    },
    checkAccountExists: function (phoneObj, email) {
        return new Promise(async (resolve, reject) => {
            try {
                module.exports.validatePhoneEmail(phoneObj, email);
            } catch(e) {
                return reject({
                    message: e
                });
            }

            try {
                let conn = await dbService.conn();

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
    sendAuthCode: function (phoneObj, email, action = '', ip_address = null) {
        return new Promise(async (resolve, reject) => {
            let phoneStr;

            if(!(module.exports.authCodes.actions.includes(action))){
                return reject({
                    message: 'Invalid action'
                });
            }

            try {
                module.exports.validatePhoneEmail(phoneObj, email);
            } catch(e) {
                return reject({
                    message: e
                });
            }

            try {
                let conn = await dbService.conn();

                let code = generateOTP(6);
                let expires = timeNow(true) + module.exports.authCodes.expiration;
                let sendThreshold = phoneObj ? module.exports.authCodes.threshold.sms : module.exports.authCodes.threshold.email;

                //prevent sending too often
                let mostRecent = await conn('auth_codes')
                    .where(function() {
                        if(phoneObj) {
                            phoneStr = `${phoneObj.countryCode}${phoneObj.number}`;

                            this.where('phone', phoneStr);
                        } else if(email) {
                            this.where('email', email);
                        }
                    })
                    .orderBy('id', 'desc')
                    .first();

                if(mostRecent && timeNow(true) - (mostRecent.created / 1000) < sendThreshold) {
                    let sec = sendThreshold - (timeNow(true) - (mostRecent.created / 1000));
                    sec = sec.toFixed(0);

                    return reject({
                        message: `Please wait ${sec} sec${sec > 1 ? 's': ''} before requesting a new code`
                    });
                }

                let insertData = {
                    ip_address,
                    code,
                    action,
                    expires,
                    created: timeNow(),
                    updated: timeNow()
                }

                if(phoneObj){
                    await sendCode(phoneStr, code);

                    insertData.phone = phoneStr;

                    await conn('auth_codes')
                        .insert(insertData);
                } else if(email) {
                    let action_str = action;
                    let body_action_str = action;

                    if(action === 'signup') {
                        action_str = 'sign-up';
                        body_action_str = 'sign up';
                    } else if(action === 'password') {
                        action_str = 'reset password';
                        body_action_str = 'reset your password';
                    }

                    let subject_extra = '';

                    if(action === 'signup') {
                        subject_extra = ` for ${process.env.NETWORK_NAME}`;
                    } else if(action === 'login') {
                        subject_extra = ` to ${process.env.NETWORK_NAME}`;
                    } else if(action === 'password') {
                        subject_extra = ` on ${process.env.NETWORK_NAME}`;
                    }

                    let html = `<div style="font-size: 13px;">Enter the following code to ${body_action_str}${subject_extra}:</div>
                                <div style="font-size: 18px; margin-top: 20px;">${code}</div>`;

                    await sendEmail(`Your ${action_str} code is ${code}`, html, email);

                    insertData.email = email;

                    await conn('auth_codes')
                        .insert(insertData);
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
    verifyAuthCode: function (code, phoneObj, email) {
        return new Promise(async (resolve, reject) => {
            let phone_str;

            try {
                module.exports.validatePhoneEmail(phoneObj, email);
            } catch(e) {
                return reject({
                    message: e
                });
            }

            try {
                if(phoneObj) {
                    phone_str = `${phoneObj.countryCode}${phoneObj.number}`;
                }

                let conn = await dbService.conn();

                let authQry = await conn('auth_codes')
                    .where('code', code)
                    .where(function() {
                        if(phone_str){
                            this.where('phone', phone_str)
                        } else if(email) {
                            this.where('email', email);
                        }
                    }).first();

                //check used
                if(authQry?.is_used) {
                    return reject({
                        message: 'Code already used. Please request a new code.'
                    });
                }

                //check expiration
                if(authQry && authQry.expires < timeNow(true)) {
                    return reject({
                        message: 'Code expired. Please request a new code.'
                    });
                }

                //check errors
                if(authQry && authQry.errors >= module.exports.authCodes.maxTries) {
                    return reject({
                        message: 'Code unavailable. Please request a new code.'
                    });
                }

                //valid verification
                if(authQry) {
                    //signup action
                    let output = {};

                    if(authQry.action === 'signup') {
                        //create new account, return person/login tokens
                        output = await require('./persons').createPerson(phoneObj, email, true);
                    } else if(['login', 'password'].includes(authQry.action)) { //login action
                        let person = await conn('persons')
                            .where(function() {
                                if(phoneObj){
                                    this.where('phone', phoneObj.number)
                                        .where('phone_country_code', phoneObj.countryCode)
                                } else {
                                    this.where('email', email)
                                }
                            })
                            .first();

                        if(!person) {
                            return reject({
                                message: 'User not found'
                            })
                        }

                        output.login_token = await module.exports.createLoginToken(person)

                        output.person_token = person.person_token;
                    }

                    //set as used
                    await conn('auth_codes')
                        .where('id', authQry.id)
                        .update({
                            is_used: true,
                            updated: timeNow()
                        });

                    return resolve(output);
                }

                //check/update errors on all recent non-used records
                let recentCodes = await conn('auth_codes')
                    .where('created', '>', timeNow() - module.exports.authCodes.expiration * 1000)
                    .where(function() {
                        if(phone_str){
                            this.where('phone', phone_str)
                        } else if(email) {
                            this.where('email', email);
                        }
                    });

                let errorBatchUpdate = [];

                for(let record of recentCodes) {
                    errorBatchUpdate.push({
                        id: record.id,
                        errors: record.errors + 1
                    })
                }

                if(errorBatchUpdate.length) {
                    await batchUpdate('auth_codes', errorBatchUpdate);
                }

                return reject({
                    message: 'Invalid code provided'
                })
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    setPassword: function (person_token, password, code = null, autoLogin = false) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof password !== 'string' || password.length < module.exports.password.minChars) {
                    return reject({
                        message: `Password must be at least ${module.exports.password.minChars} characters long.`
                    });
                }

                let conn = await dbService.conn();

                let personQry = await conn('persons')
                    .where('person_token', person_token)
                    .whereNull('deleted')
                    .first();

                if(!personQry){
                    return reject({
                        message: 'Person not found'
                    });
                }

                if(!code) {
                    if(personQry.password) {
                        return reject({
                            message: 'Code required for setting password'
                        });
                    }

                    let passwordEncrypted = await encryptionService.hash(password);

                    await conn('persons')
                        .where('id', personQry.id)
                        .update({
                            password: passwordEncrypted,
                            updated: timeNow()
                        });
                } else {
                    await module.exports.verifyAuthCode(code, null, personQry.email);

                    let passwordEncrypted = await encryptionService.hash(password);

                    await conn('persons')
                        .where('id', personQry.id)
                        .update({
                            password: passwordEncrypted,
                            updated: timeNow()
                        });
                }

                if(autoLogin){
                    let loginToken = await module.exports.createLoginToken(personQry);
                    return resolve(loginToken);
                }

                resolve();
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    setPasswordWithCode: function (email, password, code) {
        return new Promise(async (resolve, reject) => {
            try {
                if(typeof password !== 'string' || password.length < module.exports.password.minChars) {
                    return reject({
                        message: `Password must be a minimum of ${module.exports.password.minChars} characters`
                    })
                }

                let output = await module.exports.verifyAuthCode(code, null, email);

                resolve(output);
            } catch(e) {
                return reject(e);
            }
        });
    },
    resetPassword: function (email) {
        return new Promise(async (resolve, reject) => {
            try {
                await module.exports.sendAuthCode(null, email, 'password');
                resolve();
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
}