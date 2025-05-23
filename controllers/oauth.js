let axios = require('axios');
let querystring = require('querystring');

let cacheServices = require('../services/cache');
let dbServices = require('../services/db');
let jwt = require('jsonwebtoken');
let { timeNow, generateToken, getReverseClientURLScheme } = require('../services/shared');
const encryptionService = require('../services/encryption');
const { createPerson} = require('../services/persons');
const { createLoginToken } = require('../services/account');


function handleOAUthPerson(provider, providerId, email = null, name = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            let newPerson = false;

            if(!provider || !providerId) {
                return reject('Invalid OAuth login request');
            }

            let conn = await dbServices.conn();

            let person = await conn('persons')
                .where('oauth_provider', provider)
                .where('oauth_id', providerId)
                .first();

            if (!person) {
                // Check if person exists by email
                if (email) {
                    person = await conn('persons')
                        .where('email', email)
                        .whereNull('deleted')
                        .first();

                    if (person) {
                        let updateData = {
                            oauth_provider: provider,
                            oauth_id: providerId,
                            is_account_confirmed: true,
                            updated: timeNow()
                        }

                        //name might not be provided on subsequent login requests
                        //we don't want to delete it from the database
                        if(name.first) {
                            updateData.first_name = name.first;
                        }

                        if(name.last) {
                            updateData.last_name = name.last;
                        }

                        await conn('persons')
                            .where('id', person.id)
                            .update(updateData);
                        
                        return resolve({
                            id: person.id,
                            person_token: person.person_token,
                            is_new: false
                        });
                    } else {
                        newPerson = true;
                    }
                } else {
                    newPerson = true;
                }

                if(newPerson) {
                    let random_password = generateToken(12);
                    let passwordEncrypted = await encryptionService.hash(random_password);

                    let data = {
                        password: passwordEncrypted,
                        oauth_provider: provider,
                        oauth_id: providerId,
                        first_name: name.first || null,
                        last_name: name.last || null,
                    };

                    let person = await createPerson(null, email, data, false, true);

                    return resolve({
                        ...person,
                        is_new: true
                    });
                }
            } else {
                // person exists, login flow
                return resolve({
                    id: person.id,
                    person_token: person.person_token,
                    is_new: false
                });
            }
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

let oauthController = {
    profile_fields: ['first_name', 'last_name', 'gender_id', 'birth_date', 'image_url'],
    getClients: function(req, res) {
        return new Promise(async (resolve, reject) => {
            let clients = {
                google: {
                    ios: null,
                    android: null
                },
                apple: {
                    ios: null,
                    android: null
                }
            }

            let googleIOSClient = process.env.IOS_GOOGLE_OAUTH_CLIENT_ID;
            let googleAndroidClient = process.env.ANDROID_GOOGLE_OAUTH_CLIENT_ID;

            if(googleIOSClient) {
                clients.google.ios = {
                    client: googleIOSClient,
                    urlScheme: getReverseClientURLScheme(googleIOSClient)
                }
            }

            clients.google.android = googleIOSClient || null;

            clients.apple.ios = process.env.IOS_APPLE_OAUTH_CLIENT_ID || null;
            clients.apple.android = process.env.ANDROID_APPLE_OAUTH_CLIENT_ID || null;
            
            res.json({
                clients
            });
            
            resolve();
        });    
    },
    googleAuthSuccess: (req, res) => {
        return new Promise(async (resolve, reject) => {
            try {
                let profile = req.body.profile;

                // Process the person data
                let name = {
                    first: profile?.givenName || '',
                    last: profile?.familyName || ''
                };

                //create/update person
                let person = await handleOAUthPerson('google', profile.id, profile.email, name);

                //login
                let loginToken = await createLoginToken(person);

                person.login_token = loginToken;

                res.json(person);
            } catch (error) {
                res.json({
                    message: 'Error logging in with Google'
                }, 400);
            }

            resolve();
        });
    },
    appleAuthSuccess: (req, res) => {
        return new Promise(async (resolve, reject) => {
            try {
                let profile = req.body.profile;

                // Process the person data
                let name = {
                    first: profile?.name?.givenName || '',
                    last: profile?.name?.familyName || ''
                };

                //create/update person
                let person = await handleOAUthPerson('apple', profile.id, profile.email, name);

                //login
                let loginToken = await createLoginToken(person);

                person.login_token = loginToken;

                res.json(person);
            } catch (error) {
                res.json({
                    message: 'Error logging in with Apple'
                }, 400);
            }

            resolve();
        });
    },
};

module.exports = oauthController;