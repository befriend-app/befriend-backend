let axios = require('axios');
let querystring = require('querystring');

let cacheServices = require('../services/cache');
let dbServices = require('../services/db');
let jwt = require('jsonwebtoken');
let { timeNow, generateToken, getReverseClientURLScheme } = require('../services/shared');
const encryptionService = require('../services/encryption');
const { createPerson, getPerson } = require('../services/persons');
const { createLoginToken } = require('../services/account');
const { getGendersLookup } = require('../services/genders');


function handleOAUthPerson(provider, providerId, email, name = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            if(!provider || !providerId || !email) {
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
                        await conn('persons')
                            .where('id', person.id)
                            .update({
                                oauth_provider: provider,
                                oauth_id: providerId,
                                first_name: name.first || null,
                                last_name: name.last || null,
                                is_account_confirmed: true,
                                updated: timeNow()
                            });
                        
                        return resolve({
                            id: person.id,
                            person_token: person.person_token,
                            is_new: false
                        });
                    } else {
                        // Create new person
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
                    return reject('Email required for registration');
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
                    first: profile.givenName || '',
                    last: profile.familyName || ''
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
    appleAuth: (req, res) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Generate state and nonce tokens
                let stateToken = generateToken(20);
                let nonce = generateToken(20);

                // Store OAuth data in Redis
                let oauthData = {
                    redirect: req.query.redirect || '/account',
                    intent: req.query.intent || 'both',
                    nonce: nonce,
                    created: Date.now()
                };

                // Store in Redis with expiration (10 minutes)
                await cacheServices.setCache(`oauth:state:${stateToken}`, oauthData, 600);

                let base_app_url = process.env.LOCAL_APPLE_APP_URL || process.env.APP_URL;

                // Build the authorization URL for Apple
                let authUrl = 'https://appleid.apple.com/auth/authorize';

                let params = {
                    client_id: process.env.APPLE_CLIENT_ID,
                    redirect_uri: `${base_app_url}/oauth/apple/callback`,
                    response_type: 'code id_token',
                    scope: 'name email',
                    response_mode: 'form_post',
                    state: stateToken,
                    nonce: nonce
                };

                res.redirect(`${authUrl}?${querystring.stringify(params)}`);
                resolve();
            } catch (error) {
                console.error("Error in appleAuth:", error);
                res.redirect('/account/login?error=oauth_error');
                resolve();
            }
        });
    },
    appleCallback: (req, res) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Apple uses form_post so the parameters come in the body
                let { code, id_token, state: stateToken, person: appleperson } = req.body;

                if (!stateToken) {
                    console.error("No state token provided");
                    res.redirect('/account/login?error=invalid_state');
                    return resolve();
                }

                let oauthData = await cacheServices.getObj(`oauth:state:${stateToken}`);

                if (!oauthData) {
                    console.error("Invalid or expired state token");
                    res.redirect('/account/login?error=invalid_state');
                    return resolve();
                }

                // Check for authorization code and token
                if (!code || !id_token) {
                    console.error("No authorization code or ID token provided");
                    res.redirect('/account/login?error=no_code');
                    return resolve();
                }

                // Decode the ID token to get person information
                let decodedToken = jwt.decode(id_token);

                // Verify the nonce to prevent replay attacks
                if (decodedToken.nonce !== oauthData.nonce) {
                    console.error("Invalid nonce");
                    res.redirect('/account/login?error=invalid_nonce');
                    return resolve();
                }

                // Extract person information
                let appleId = decodedToken.sub;
                let email = decodedToken.email;

                // Name comes in the person parameter (only on first auth)
                let name = { first: '', last: '' };

                if (appleperson && typeof appleperson === 'string') {
                    try {
                        let parsedperson = JSON.parse(appleperson);

                        if (parsedperson.name) {
                            name.first = parsedperson.name.firstName || '';
                            name.last = parsedperson.name.lastName || '';
                        }
                    } catch (e) {
                        console.error('Error parsing Apple person data:', e);
                    }
                }

                // Process the person
                let person = await handleOAUthPerson('apple', appleId, email, name);

                // Use your custom session middleware
                await sessionMid.setSessionperson(req, person.id);

                let session = personFromReq(req);

                await backendServices.updateTablesSessionToperson(session.session_id, person.id);

                // Clean up Redis state
                await cacheServices.deleteKeys([`oauth:state:${stateToken}`]);

                // letruct the final redirect URL
                let redirectUrl = oauthData.redirect || '/account';

                if (person.is_new) {
                    redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 'welcome=true';
                }

                res.redirect(redirectUrl);

                resolve();
            } catch (error) {
                console.error('Apple OAuth error:', error);
                res.redirect('/account/login?error=oauth_error');
                resolve();
            }
        });
    }
};

module.exports = oauthController;