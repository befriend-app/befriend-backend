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

                 let networks = await conn('networks')
                     // .where('created', '<', timeNow() - 60000)
                     .orderBy('is_trusted', 'desc')
                     .select('network_token', 'network_name', 'network_logo', 'base_domain', 'api_domain', 'priority',
                        'is_network_known', 'is_befriend', 'is_trusted', 'is_online', 'is_blocked', 'last_online', 'created', 'updated'
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

            let conn;

            let data = req.body.network;

            let keys_exchange_token_other_network = req.body.keys_exchange_token;

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

            if(!keys_exchange_token_other_network) {
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

            //check for existence of domain and token
            try {
                conn = await dbService.conn();

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

                let secret_key_me = generateToken(60);

                let exchange_key_url = getURL(data.api_domain, 'keys/home/from');

                let keys_exchange_token_me = generateToken(40);

                networkService.keys.oneTime[keys_exchange_token_me] = secret_key_me;

                let befriend_network = await conn('networks')
                    .where('network_token', networkService.token)
                    .where('is_befriend', true)
                    .first();

                let r2 = await axios.post(exchange_key_url, {
                    network: befriend_network,
                    secret_key_from: secret_key_me,
                    keys_exchange_token: {
                        me: keys_exchange_token_me,
                        you: keys_exchange_token_other_network
                    },
                });

                res.json({
                    message: "Network added successfully",
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

            let conn, network_qry;

            //saved to secret_key_from
            let befriend_network = req.body.network;
            let secret_key_to = req.body.secret_key_from;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.you) || !(keys_exchange_token.you in networkService.keys.oneTime)) {
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

            //create network
            try {
                conn = await dbService.conn();

                await conn('networks')
                    .insert({
                        network_token: befriend_network.network_token,
                        network_name: befriend_network.network_name,
                        network_logo: befriend_network.network_logo,
                        base_domain: befriend_network.base_domain,
                        api_domain: befriend_network.api_domain,
                        priority: befriend_network.priority,
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
            } catch(e) {
                console.error(e);

                res.json({
                    message: "Error adding befriend network"
                }, 400);

                return resolve();
            }

            //set ourselves to known
            try {
                await conn('networks')
                    .where('network_token', networkService.token)
                    .where('is_self', true)
                    .update({
                        is_network_known: true,
                        updated: timeNow()
                    });
            } catch(e) {

            }

            try {
                networkService.keys.oneTime[keys_exchange_token.you] = secret_key_to;

                let secret_key_me = generateToken(60);

                await axios.post(getURL(befriend_network.api_domain, `keys/home/to`), {
                    network_token: networkService.token,
                    secret_key_from: secret_key_me,
                    keys_exchange_token: {
                        you: keys_exchange_token.me,
                        me: keys_exchange_token.you
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
            let secret_key_other_network = req.body.secret_key_from;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.you) || !(keys_exchange_token.you in networkService.keys.oneTime)) {
                res.json({
                    message: "Invalid one time token"
                }, 400);

                return resolve();
            }

            let secret_key_me = networkService.keys.oneTime[keys_exchange_token.you];

            if(!secret_key_me) {
                res.json({
                    message: "Secret key does not exist",
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
                await axios.post(getURL(network_qry.api_domain, `keys/home/to`), {
                    network_token: networkService.token,
                    secret_key_from: secret_key_me,
                    keys_exchange_token: {
                        you: keys_exchange_token.me,
                        me: keys_exchange_token.you
                    }
                });
            } catch(e) {

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
            let secret_key_other_network = req.body.secret_key_from;
            let keys_exchange_token = req.body.keys_exchange_token;

            if(!(keys_exchange_token) || !(keys_exchange_token.you) || !(keys_exchange_token.you in networkService.keys.oneTime)) {
                res.json({
                    message: "Invalid one time token"
                }, 400);

                return resolve();
            }

            let secret_key_me = networkService.keys.oneTime[keys_exchange_token.you];

            if(!secret_key_me) {
                res.json({
                    message: "Secret key does not exist",
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
                await axios.post(getURL(network_qry.api_domain, `keys/home/to`), {
                    network_token: networkService.token,
                    secret_key_from: secret_key_me,
                    keys_exchange_token: {
                        you: keys_exchange_token.me,
                        me: keys_exchange_token.you
                    }
                });
            } catch(e) {

            }

            resolve();
        });
    }
}