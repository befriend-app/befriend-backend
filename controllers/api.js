const axios = require('axios');
const tldts = require('tldts');
const dbService = require('../services/db');
const {isProdApp, isIPAddress, isLocalHost, getURL, timeNow} = require("../services/shared");

module.exports = {
    getNetworks: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                 let conn = await dbService.conn();

                 let networks = await conn('networks')
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
            let conn;

            let data = req.body.network;

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

                res.json({
                    message: "Network added successfully"
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
    }
}