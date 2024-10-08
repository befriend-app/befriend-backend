const axios = require('axios');
const tldts = require('tldts');

const activitiesService = require('../services/activities');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const networkService = require('../services/network');
const bcrypt = require("bcryptjs");

const {isProdApp, isIPAddress, isLocalHost, getURL, timeNow, generateToken, joinPaths, getExchangeKeysKey,
    confirmDecryptedRegistrationNetworkToken,
    getPersonLoginCacheKey
} = require("../services/shared");

const {getNetwork, getNetworkSelf} = require("../services/network");
const {encrypt} = require("../services/encryption");
const {deleteKeys} = require("../services/cache");
const {getPersonByEmail} = require('../services/persons');
const {getCategoriesPlaces} = require("../services/places");


module.exports = {
    getNetworks: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                 let conn = await dbService.conn();

                 let networks = await conn('networks AS n')
                     .join('networks AS n2', 'n.registration_network_id', '=', 'n2.id')
                     // .where('created', '<', timeNow() - 60000)
                     .orderBy('n.is_trusted', 'desc')
                     .orderBy('n.is_befriend', 'desc')
                     .orderBy('n.priority', 'asc')
                     .select(
                         'n.network_token', 'n.network_name', 'n.network_logo', 'n.base_domain', 'n.api_domain',
                         'n.priority', 'n.is_network_known', 'n.is_befriend', 'n.is_trusted', 'n.is_online', 'n.is_blocked',
                         'n.last_online', 'n.created', 'n.updated', 'n2.network_token AS registration_network_token'
                     );

                 res.json({
                     networks: networks
                 });
            } catch(e) {
                res.json("Error getting networks", 400);
            }
        });
    },
    addNetwork: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //befriend home

            let conn, network_self;

            let data = req.body.network;

            //for key exchange process
            let keys_new_network_token = req.body.keys_exchange_token;

            let required_props = [
                'network_token',
                'network_name',
                'api_domain',
            ];

            //check for required properties
            let missing = [];

            for(let prop of required_props) {
                if(!(data[prop])) {
                    missing.push(prop);
                }
            }

            if(!keys_new_network_token) {
                missing.push("keys_exchange_token");
            }

            if(missing.length) {
                res.json({
                    missing_required_values: missing
                }, 400);

                return resolve();
            }

            //domain validation
            let base = tldts.parse(data.base_domain);
            let api = tldts.parse(data.api_domain);

            if(base.hostname !== api.hostname) {
                res.json({
                    domain_mismatch: {
                        base_domain: base,
                        api_domain: api
                    }
                }, 400);

                return resolve();
            }

            if(isProdApp()) {
                if(isIPAddress(data.base_domain) || isLocalHost(data.base_domain)) {
                    res.json({
                        message: "IP/localhost not allowed",
                        base_domain: data.base_domain
                    }, 400);

                    return resolve();
                }
            }

            //do not allow adding network on is_befriend=false network
            try {
                conn = await dbService.conn();

                network_self = await conn('networks AS n')
                    .join('networks AS n2', 'n.registration_network_id', '=', 'n2.id')
                    .where('n.network_token', networkService.token)
                    .where('n.is_self', true)
                    .where('n.is_befriend', true)
                    .select('n.*', 'n2.network_token AS registration_network_token')
                    .first();

                if(!network_self) {
                    res.json({
                        message: "Could not register network"
                    }, 400);

                    return resolve();
                }
            } catch(e) {
                console.error(e);
            }

            //check for existence of domain and token
            try {
                let domain_duplicate_qry = await conn('networks')
                    .where('base_domain', base.hostname)
                    .first();

                if(domain_duplicate_qry) {
                    res.json({
                        message: "Domain already exists",
                        base_domain: data.base_domain
                    }, 400);

                    return resolve();
                }

                let token_duplicate_qry = await conn('networks')
                    .where('network_token', data.network_token)
                    .first();

                if(token_duplicate_qry) {
                    res.json({
                        message: "Token already exists",
                        network_token: data.network_token
                    }, 400);

                    return resolve();
                }
            } catch(e) {
                console.error(e);
            }

            //ping network before adding to known
            try {
                let happy_connect_url = getURL(data.api_domain, 'happy-connect');

                let r = await axios.get(happy_connect_url);

                if(!('happiness' in r.data)) {
                    res.json({
                        message: "Missing happiness in network-add"
                    }, 400);

                    return resolve();
                }

                let network_data = {
                    registration_network_id: network_self.id,
                    network_token: data.network_token,
                    network_name: data.network_name,
                    network_logo: data.network_logo || null,
                    base_domain: data.base_domain,
                    api_domain: data.api_domain,
                    is_network_known: true,
                    is_self: false,
                    is_befriend: false,
                    is_trusted: false,
                    is_blocked: false,
                    is_online: true,
                    last_online: timeNow(),
                    admin_name: data.admin_name || null,
                    admin_email: data.admin_email || null,
                    created: timeNow(),
                    updated: timeNow()
                };

                await conn('networks')
                    .insert(network_data);

                //continue key exchange process
                let secret_key_me = generateToken(60);

                let exchange_key_url = getURL(data.api_domain, 'keys/home/from');

                let keys_exchange_token_me = generateToken(40);

                networkService.keys.oneTime[keys_exchange_token_me] = secret_key_me;

                let r2 = await axios.post(exchange_key_url, {
                    network: network_self,
                    secret_key_befriend: secret_key_me,
                    keys_exchange_token: {
                        befriend: keys_exchange_token_me,
                        new_network: keys_new_network_token
                    },
                });

                res.json({
                    message: "Network added successfully",
                    network: network_self
                }, 201);
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error pinging api_domain during network-add"
                }, 400);

                return resolve();
            }

            return resolve();
        });
    },
    exchangeKeysHomeFrom: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //network n

            let conn;

            //saved to secret_key_from
            let befriend_network = req.body.network;
            let secret_key_befriend = req.body.secret_key_befriend;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.new_network) || !(keys_exchange_token.new_network in networkService.keys.oneTime)) {
                res.json({
                    message: "Invalid one time token"
                }, 400);

                return resolve();
            }

            if(!(befriend_network)) {
                res.json({
                    message: "Missing network data"
                }, 400);

                return resolve();
            }

            let befriend_network_id;

            //create network
            try {
                conn = await dbService.conn();

                befriend_network_id = await conn('networks')
                    .insert({
                        network_token: befriend_network.network_token,
                        network_name: befriend_network.network_name,
                        network_logo: befriend_network.network_logo,
                        base_domain: befriend_network.base_domain,
                        api_domain: befriend_network.api_domain,
                        priority: befriend_network.priority,
                        keys_exchanged: false,
                        is_network_known: befriend_network.is_network_known,
                        is_self: false,
                        is_befriend: befriend_network.is_befriend,
                        is_trusted: befriend_network.is_trusted,
                        is_blocked: befriend_network.is_blocked,
                        is_online: befriend_network.is_online,
                        last_online: befriend_network.last_online,
                        admin_name: befriend_network.admin_name,
                        admin_email: befriend_network.admin_email,
                        created: timeNow(),
                        updated: timeNow()
                    });

                befriend_network_id = befriend_network_id[0];
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error adding befriend network"
                }, 400);

                return resolve();
            }

            //for own network: set registration_network_id, is_network_known
            try {
                await conn('networks')
                    .where('network_token', networkService.token)
                    .where('is_self', true)
                    .update({
                        registration_network_id: befriend_network_id,
                        is_network_known: true,
                        updated: timeNow()
                    });
            } catch(e) {
                console.error(e);
            }

            //set registration_network_id for just added registering network
            try {
                if(befriend_network.registration_network_token) {
                    let qry = await conn('networks')
                        .where('network_token', befriend_network.registration_network_token)
                        .first();

                    if(qry) {
                        await conn('networks')
                            .where('id', befriend_network_id)
                            .update({
                                registration_network_id: qry.id,
                                updated: timeNow()
                            });
                    }
                }

            } catch(e) {
                console.error(e);
            }

            try {
                //save befriend secret key, set self secret key
                networkService.keys.oneTime[keys_exchange_token.befriend] = secret_key_befriend;

                let secret_key_new_network = generateToken(60);

                networkService.keys.oneTime[keys_exchange_token.new_network] = secret_key_new_network;

                await axios.post(getURL(befriend_network.api_domain, `keys/home/to`), {
                    network_token: networkService.token,
                    secret_key_new_network: secret_key_new_network,
                    keys_exchange_token: {
                        befriend: keys_exchange_token.befriend,
                        new_network: keys_exchange_token.new_network
                    }
                });
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    },
    exchangeKeysHomeTo: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //befriend home
            let conn, network_qry;

            //saved to secret_key_from
            let network_token = req.body.network_token;
            let secret_key_new_network = req.body.secret_key_new_network;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.befriend) || !(keys_exchange_token.befriend in networkService.keys.oneTime)) {
                res.json({
                    message: "Invalid one time token"
                }, 400);

                return resolve();
            }

            let secret_key_befriend = networkService.keys.oneTime[keys_exchange_token.befriend];

            if(!secret_key_befriend) {
                res.json({
                    message: "Secret key not found",
                }, 400);

                return resolve();
            }

            if(!secret_key_new_network) {
                res.json({
                    message: "New network secret key required",
                }, 400);

                return resolve();
            }

            //validate token
            try {
                conn = await dbService.conn();

                network_qry = await conn('networks')
                    .where('network_token', network_token)
                    .first();

                if(!network_qry) {
                    res.json({
                        message: "Invalid network token",
                    }, 400);

                    return resolve();
                }
            } catch(e) {
                console.error(e);
            }

            try {
                let r = await axios.post(getURL(network_qry.api_domain, `keys/home/save`), {
                    network_token: networkService.token,
                    secret_key_befriend: secret_key_befriend,
                    keys_exchange_token: {
                        befriend: keys_exchange_token.befriend,
                        new_network: keys_exchange_token.new_network
                    }
                });

                if(r.status === 201) {
                    await conn('networks_secret_keys')
                        .insert({
                            network_id: network_qry.id,
                            is_active: true,
                            secret_key_from: secret_key_new_network,
                            secret_key_to: secret_key_befriend,
                            created: timeNow(),
                            updated: timeNow()
                        });

                    await conn('networks')
                        .where('id', network_qry.id)
                        .update({
                            keys_exchanged: true,
                            updated: timeNow()
                        });

                    //delete token from memory
                    delete networkService.keys.oneTime[keys_exchange_token.befriend];
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    },
    exchangeKeysHomeSave: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //network n

            let conn, network_qry;

            //saved to secret_key_from
            let network_token = req.body.network_token;
            let secret_key_befriend = req.body.secret_key_befriend;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.new_network) || !(keys_exchange_token.new_network in networkService.keys.oneTime)) {
                res.json({
                    message: "Invalid one time token"
                }, 400);

                return resolve();
            }

            let secret_key_new_network = networkService.keys.oneTime[keys_exchange_token.new_network];

            if(!secret_key_new_network) {
                res.json({
                    message: "Self secret key not found",
                }, 400);

                return resolve();
            }

            if(!secret_key_befriend) {
                res.json({
                    message: "Befriend secret key required",
                }, 400);

                return resolve();
            }

            //validate token
            try {
                conn = await dbService.conn();

                network_qry = await conn('networks')
                    .where('network_token', network_token)
                    .first();

                if(!network_qry) {
                    res.json({
                        message: "Invalid network token",
                    }, 400);

                    return resolve();
                }

                await conn('networks_secret_keys')
                    .insert({
                        network_id: network_qry.id,
                        is_active: true,
                        secret_key_from: secret_key_befriend,
                        secret_key_to: secret_key_new_network,
                        created: timeNow(),
                        updated: timeNow()
                    });

                await conn('networks')
                    .where('id', network_qry.id)
                    .update({
                        keys_exchanged: true,
                        updated: timeNow()
                    });

                //delete tokens from memory
                delete networkService.keys.oneTime[keys_exchange_token.new_network];
            } catch(e) {
                console.error(e);
            }

            res.json({
                message: "Keys exchanged successfully"
            }, 201);

            resolve();
        });
    },
    keysExchangeEncrypt: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //registering server/befriend

            //We enable key exchange between two networks by encrypting the to_network's network_token with their secret key stored in our database.
            //We pass the from_network's exchange_token to the to_network to authenticate the to_network's request back to the from_network.

            let my_network, from_network, to_network;

            let encrypted_network_tokens = {
                from: null,
                to: null
            };

            let exchange_token = req.body.exchange_token;

            if(!exchange_token) {
                res.json({
                    message: "No exchange token provided"
                }, 400);

                return resolve();
            }

            if(!('network_tokens' in req.body)) {
                res.json({
                    message: "No network tokens provided"
                }, 400);

                return resolve();
            }

            let from_network_token = req.body.network_tokens.from;
            let to_network_token = req.body.network_tokens.to;

            if(!from_network_token || !to_network_token) {
                res.json({
                    message: "Both from and to network tokens required"
                }, 400);

                return resolve();
            }

            //ensure the to_network was registered by us
            try {
                my_network = await getNetworkSelf();
                from_network = await getNetwork(from_network_token);
                to_network = await getNetwork(to_network_token);

                if(to_network.registration_network_id !== my_network.id) {
                    res.json({
                        message: "Could not facilitate keys exchange with to_network",
                        network_tokens: req.body.network_tokens
                    }, 400);

                    return resolve();
                }

                if(!from_network || !to_network) {
                    res.json({
                        message: "Could not find both networks",
                        network_tokens: req.body.network_tokens
                    }, 400);

                    return resolve();
                }
            } catch(e) {
                res.json({
                    message: "Error verifying networks"
                }, 400);

                return resolve();
            }

            //get secret key of from and to_network
            try {
                let conn = await dbService.conn();

                let from_secret_key_qry = await conn('networks_secret_keys')
                    .where('network_id', from_network.id)
                    .where('is_active', true)
                    .first();

                let to_secret_key_qry = await conn('networks_secret_keys')
                    .where('network_id', to_network.id)
                    .where('is_active', true)
                    .first();

                if(!from_secret_key_qry || !to_secret_key_qry) {
                    res.json({
                        message: "Could not find keys for both networks"
                    }, 400);

                    return resolve();
                }

                encrypted_network_tokens.from = await encrypt(from_secret_key_qry.secret_key_to, from_network_token);
                encrypted_network_tokens.to = await encrypt(to_secret_key_qry.secret_key_to, to_network_token);
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error processing tokens for keys exchange"
                }, 400);

                return resolve();
            }

            if(!encrypted_network_tokens.from || !encrypted_network_tokens.to) {
                res.json({
                    message: "Could not encrypt tokens"
                }, 400);

                return resolve();
            }

            try {
                let r = await axios.post(getURL(to_network.api_domain, `/keys/exchange/decrypt`), {
                    exchange_token_from: exchange_token,
                    encrypted: encrypted_network_tokens,
                    network_tokens: req.body.network_tokens,
                });

                if(r.status === 201) {
                    res.json({
                        message: "Keys exchange process started successfully",
                        network_tokens: req.body.network_tokens
                    }, 201);
                } else {
                    res.json({
                        message: "Error communicating with to_network",
                        network_tokens: req.body.network_tokens
                    }, 400);
                }
            } catch(e) {
                res.json({
                    message: "Error communicating with to_network",
                    network_tokens: req.body.network_tokens
                }, 400);

                return resolve();
            }
        });
    },
    keysExchangeDecrypt: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //request received on to_network

            let my_network, from_network;

            //request received from registering/befriend network
            let exchange_token = req.body.exchange_token_from;
            let encrypted = req.body.encrypted;
            let network_tokens = req.body.network_tokens;

            if(!exchange_token) {
                res.json({
                    message: "Exchange token required"
                }, 400);

                return resolve();
            }

            if(!encrypted || !encrypted.from || !encrypted.to) {
                res.json({
                    message: "Encrypted tokens required"
                }, 400);

                return resolve();
            }

            if(!network_tokens || !network_tokens.from || !network_tokens.to) {
                res.json({
                    message: "Network token data required"
                }, 400);

                return resolve();
            }

            try {
                await confirmDecryptedRegistrationNetworkToken(encrypted.to);
            } catch(e) {
                res.json({
                    message: e
                }, 400);

                return resolve();
            }

            try {
                let conn = await dbService.conn();

                //get domain for from_network
                from_network = await getNetwork(network_tokens.from);

                if(!from_network) {
                    res.json({
                        message: "From network not found"
                    }, 400);

                    return resolve();
                }

                //generate my secret_key for from_network
                let secret_key_self = generateToken(60);

                let r = await axios.post(getURL(from_network.api_domain, `/keys/exchange/save`), {
                    exchange_token: exchange_token,
                    encrypted: encrypted,
                    secret_key_from: secret_key_self
                });

                if(r.status === 201 && r.data.secret_key_from) {
                    await conn(`networks_secret_keys`)
                        .insert({
                            network_id: from_network.id,
                            is_active: true,
                            secret_key_from: r.data.secret_key_from,
                            secret_key_to: secret_key_self,
                            created: timeNow(),
                            updated: timeNow()
                        });

                    //set keys exchanged
                    await conn('networks')
                        .where('id', from_network.id)
                        .update({
                            keys_exchanged: true,
                            updated: timeNow()
                        });
                } else {
                    res.json({
                        message: "Error exchanging keys with from_network"
                    }, 400);

                    return resolve();
                }

                res.json("Keys exchanged successfully", 201);

                return resolve();
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Could not exchange keys with from_network"
                }, 400);

                return resolve();
            }
        });
    },
    keysExchangeSave: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //request received on from_network

            let to_network, cache_key;

            //request received from to_network
            let exchange_token = req.body.exchange_token;
            let encrypted = req.body.encrypted;
            let secret_key_from = req.body.secret_key_from;

            if(!exchange_token) {
                res.json({
                    message: "Exchange token required"
                }, 400);

                return resolve();
            }

            if(!encrypted || !encrypted.from) {
                res.json({
                    message: "Encrypted tokens required"
                }, 400);

                return resolve();
            }

            if(!secret_key_from) {
                res.json({
                    message: "to_network secret key not provided"
                }, 400);

                return resolve();
            }

            try {
                //retrieve to_network_token from exchange_token cache key
                cache_key = getExchangeKeysKey(exchange_token);

                let to_network_token = await cacheService.get(cache_key);

                if(!to_network_token) {
                    res.json({
                        message: "Invalid exchange token"
                    }, 400);

                    return resolve();
                }

                to_network = await getNetwork(to_network_token);

                if(!to_network) {
                    res.json({
                        message: "Could not find to_network"
                    }, 400);

                    return resolve();
                }
            } catch(e) {
                res.json({
                    message: "Error verifying networks"
                }, 400);

                return resolve();
            }

            //confirm decrypted network token
            try {
                 await confirmDecryptedRegistrationNetworkToken(encrypted.from);
            } catch(e) {
                res.json({
                    message: e
                }, 400);

                return resolve();
            }

            try {
                let conn = await dbService.conn();

                 let secret_key_to = generateToken(60);

                 await conn('networks_secret_keys')
                     .insert({
                         network_id: to_network.id,
                         is_active: true,
                         secret_key_from: secret_key_from,
                         secret_key_to: secret_key_to,
                         created: timeNow(),
                         updated: timeNow()
                     });

                //set keys exchanged
                await conn('networks')
                    .where('id', to_network.id)
                    .update({
                        keys_exchanged: true,
                        updated: timeNow()
                    });

                 res.json({
                     secret_key_from: secret_key_to,
                     secret_key_to: secret_key_from
                 }, 201);

                 //delete exchange_token from cache
                 await deleteKeys(cache_key);

                 return resolve();
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error saving keys"
                }, 400);

                return resolve();
            }
        });
    },
    doLogin: function(req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_email = req.body.email;
                let person_password = req.body.password;

                let person = await getPersonByEmail(person_email);
                
                // check if passwords are equal
                const validPassword = await bcrypt.compare(person_password, person.password);

                if(!validPassword) {
                    res.json('Invalid login', 403);
                    return resolve();
                }

                // generate login token return in response. Used for authentication on future requests
                let login_token = generateToken();

                // save to both mysql and redis
                let conn = await dbService.conn();
                
                await conn('persons_login_tokens')
                    .insert({
                        person_id: person.id,
                        login_token: login_token,
                        expires: null,
                        created: timeNow(),
                        updated: timeNow()
                    });

                let cache_key = getPersonLoginCacheKey(person.person_token);

                await cacheService.addItemToSet(cache_key, login_token);

                res.json({
                    login_token: login_token,
                    message: "Login Successful"
                }, 200);
                
                return resolve();
            } catch(e) {
                // handle logic for different errors
                res.json('Login failed', 400);
                return reject(e);
            }
        });
    },
    getActivityTypes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            function getActivity(item) {
                if (!item.parent_activity_type_id) {
                    return data_organized[item.at_id];
                }

                for (let parent_id in data_organized) {
                    const level_2_dict = data_organized[parent_id].sub;

                    // Check level 2
                    for (let level_2_id in level_2_dict) {
                        if (parseInt(level_2_id) === item.at_id) {
                            return level_2_dict[level_2_id];
                        }

                        // Check level 3
                        const level_3_dict = level_2_dict[level_2_id].sub;

                        for (let level_3_id in level_3_dict) {
                            if (parseInt(level_3_id) === item.at_id) {
                                return level_3_dict[level_3_id];
                            }
                        }
                    }
                }

                return null; // If activity is not found
            }

            function createActivityObject(activity) {
                let data = {
                    name: activity.activity_name,
                    title: activity.activity_title,
                    token: activity.activity_type_token,
                    image: activity.activity_image,
                    emoji: activity.activity_emoji,
                    categories: [],
                    sub: {}
                };

                //include bool
                for(let k in activity) {
                    if(k.startsWith('is_')) {
                        if(activity[k]) {
                            data[k] = activity[k];
                        }
                    }
                }

                return data;
            }

            let cache_key = cacheService.keys.activity_types;
            let data_organized = {};

            try {
                //use existing data in cache if exists
                let data = await cacheService.get(cache_key, true);

                if(data) {
                    // res.json(data);
                    //
                    // return resolve();
                }

                let conn = await dbService.conn();

                //organize by activity types
                let parent_activity_types = await conn('activity_types')
                    .whereNull('parent_activity_type_id')
                    .orderBy('sort_position');

                //level 1
                for(let at of parent_activity_types) {
                    data_organized[at.id] = createActivityObject(at);
                }

                //level 2
                for(let parent_id in data_organized) {
                    let level_2_qry = await conn('activity_types')
                        .where('parent_activity_type_id', parent_id)

                    for(let at of level_2_qry) {
                        data_organized[parent_id].sub[at.id] = createActivityObject(at);
                    }
                }

                //level 3
                for(let parent_id in data_organized) {
                    let level_2_dict = data_organized[parent_id].sub;

                    for(let level_2_id in level_2_dict) {
                        let level_3_qry = await conn('activity_types')
                            .where('parent_activity_type_id', level_2_id);

                        for(let at of level_3_qry) {
                            data_organized[parent_id].sub[level_2_id].sub[at.id] = createActivityObject(at);
                        }
                    }
                }

                //add venues to each category/subcategory

                // let qry = await conn('activity_type_venues AS atv')
                //     .join('activity_types AS at', 'at.id', '=', 'atv.activity_type_id')
                //     .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
                //     .where('at.is_visible', true)
                //     .orderBy('at.sort_position')
                //     .orderBy('atv.sort_position')
                //     .select('at.*', 'at.id AS at_id', 'vc.category_name', 'fsq_id', 'vc.category_token');
                //
                // for(let item of qry) {
                //     let activity = getActivity(item);
                //
                //     activity.categories.push(item.fsq_id);
                // }

                await cacheService.setCache(cache_key, data_organized);

                res.json(data_organized);

                return resolve();
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error getting activity venue data"
                }, 400);

                return resolve();
            }
        });
    },
    getActivityTypePlaces: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let activity_type, location;

            try {
                let activity_type_token = req.params.activity_type_token;

                if(!activity_type_token) {
                    res.json({
                        message: "activity_type token required"
                    }, 400);

                    return resolve();
                }

                location = req.body.location;

                if(!location || !(location.lat && location.lon)) {
                    res.json({
                        message: "Location required"
                    }, 400);

                    return resolve();
                }

                let conn = await dbService.conn();

                //get fsq_ids from cache or db
                let cache_key = `${cacheService.keys.activity_type_venue_categories}${activity_type_token}`;

                let activity_fsq_ids = await cacheService.get(cache_key, true);

                if(!activity_fsq_ids) {
                    //get activity type
                    activity_type = await activitiesService.getActivityType(activity_type_token);

                    if(!activity_type) {
                        res.json({
                            message: "Activity type not found"
                        }, 400);

                        return resolve();
                    }

                    let categories_qry = await conn('activity_type_venues AS atv')
                        .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
                        .where('atv.activity_type_id', activity_type.id)
                        .where('atv.is_active', true)
                        .orderBy('atv.sort_position')
                        .select('vc.fsq_id');

                    activity_fsq_ids = categories_qry.map(x=>x.fsq_id);

                    await cacheService.setCache(cache_key, activity_fsq_ids);
                }

                try {
                    let places = await getCategoriesPlaces(activity_fsq_ids, location);

                    res.json({
                        places: places
                    });
                } catch(e) {
                    console.error(e);

                    res.json({
                        message: "Error getting category(s) places"
                    }, 400);
                }
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error getting places for activity"
                }, 400);
            }

            return resolve();
        });
    },
    getMapboxToken: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //get temporary mapbox token for use in app

            const tokenConfig = {
                "note": "Temporary token for accessing maps",
                "expires": new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiration
                "scopes": [
                    "styles:tiles",
                    "styles:read", // Allow reading styles
                    "fonts:read",  // Allow reading fonts
                    "datasets:read",
                    "tilesets:read" // Allow reading tilesets
                ]
            };

            try {
                const response = await axios.post(
                    'https://api.mapbox.com/tokens/v2/befriend-app', //update username for forks of repo
                    tokenConfig,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.MAPBOX_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                res.json({
                    token: response.data.token,
                }, 200);
            } catch(e) {
                console.error(e);

                res.json("Error getting map token", 400);
            }

            resolve();
        });
    }
}