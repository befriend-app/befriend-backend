const axios = require('axios');
const tldts = require('tldts');

const dbService = require('../services/db');
const networkService = require('../services/network');

const {isProdApp, isIPAddress, isLocalHost, getURL, timeNow, generateToken, joinPaths} = require("../services/shared");


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
            } catch(e) {
                console.error(e);
            }

            res.json({
                message: "Keys exchanged successfully"
            }, 201);

            resolve();
        });
    }
}