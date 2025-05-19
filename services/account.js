const cacheService = require('./cache');
const dbService = require('./db');
const { country_codes } = require('./sms');
const { isValidPhone, isValidEmail, generateToken, timeNow } = require('./shared');
const { getPerson } = require('./persons');
const encryptionService = require('./encryption');

module.exports = {
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

            //data already validated in checkAccountExists
            if(phoneObj){

            }
        });
    },
}