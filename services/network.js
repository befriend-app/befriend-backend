const axios = require('axios');
const tldts = require('tldts');

const cacheService = require('../services/cache');
const dbService = require('../services/db');

const {
    joinPaths,
    getRepoRoot,
    readFile,
    generateToken,
    writeFile,
    isProdApp,
    timeNow,
    getCleanDomain,
    isIPAddress,
    getURL,
    hasPort,
    isLocalHost,
} = require('./shared');

const encryptionService = require('./encryption');

function init() {
    return new Promise(async (resolve, reject) => {
        let conn;

        try {
            await module.exports.loadAltDomains();
        } catch (e) {
            console.error(e);
        }

        try {
            conn = await dbService.conn();
        } catch (e) {
            console.error(e);
        }

        //get/create network token for self
        let env_network_key = module.exports.env.network_token_key;

        let network_token = process.env[env_network_key];

        if (!network_token) {
            //add auto-generated network token to env
            let env_path = joinPaths(getRepoRoot(), '.env');
            let env_data;

            try {
                env_data = await readFile(env_path);
            } catch (e) {
                console.error('.env file required');
                process.exit();
            }

            try {
                let env_lines = env_data.split('\n');
                network_token = generateToken(12);
                module.exports.token = network_token;

                let token_line = `${env_network_key}=${network_token}`;
                env_lines.push(token_line);

                let new_env_data = env_lines.join('\n');

                await writeFile(env_path, new_env_data);
            } catch (e) {
                console.error(e);
            }
        } else {
            module.exports.token = network_token;
        }

        //check for existence of network token on self
        try {
            let network_qry = await conn('networks')
                .where('network_token', network_token)
                .where('is_self', true)
                .first();

            if (!network_qry) {
                //check for all required values before creating record
                let missing = [];
                let invalid = [];

                let network_data = {
                    network_token: network_token,
                    network_name: process.env.NETWORK_NAME,
                    network_logo: process.env.NETWORK_LOGO || null,
                    app_icon: process.env.NETWORK_APP_ICON || null,
                    api_domain: getCleanDomain(process.env.NETWORK_API_DOMAIN),
                    base_domain: getCleanDomain(process.env.NETWORK_API_DOMAIN, true),
                    is_self: true,
                    is_verified: false,
                    is_online: true,
                    last_online: timeNow(),
                    is_active: true, //for self
                    admin_name: process.env.ADMIN_NAME || null,
                    admin_email: process.env.ADMIN_EMAIL || null,
                    created: timeNow(),
                    updated: timeNow(),
                };

                if (!network_data.network_name) {
                    missing.push('NETWORK_NAME');
                }

                if (!network_data.api_domain) {
                    missing.push('NETWORK_API_DOMAIN');
                }

                if (!network_data.admin_name) {
                    missing.push('ADMIN_NAME');
                }

                if (!network_data.admin_email) {
                    missing.push('ADMIN_EMAIL');
                }

                if (network_data.network_name && network_data.network_name.startsWith('<')) {
                    invalid.push('NETWORK_NAME');
                }

                if (network_data.network_logo && network_data.network_logo.startsWith('<')) {
                    invalid.push('NETWORK_LOGO');
                }

                if (network_data.app_icon && network_data.app_icon.startsWith('<')) {
                    invalid.push('NETWORK_APP_ICON');
                }

                if (network_data.api_domain && network_data.api_domain.startsWith('<')) {
                    invalid.push('NETWORK_API_DOMAIN');
                }

                if (
                    hasPort(network_data.api_domain) &&
                    !isIPAddress(network_data.api_domain) &&
                    !isLocalHost(network_data.api_domain)
                ) {
                    invalid.push('Port not allowed in domain');
                }

                if (missing.length || invalid.length) {
                    if (missing.length) {
                        console.error({
                            message: '.env keys needed',
                            required: missing,
                        });
                    }

                    if (invalid.length) {
                        console.error({
                            message: 'invalid .env key values',
                            invalid: invalid,
                        });
                    }

                    process.exit();
                }

                //Do not allow ip's or ports in prod
                if (isProdApp()) {
                    let is_ip_domain = isIPAddress(network_data.api_domain);

                    if (is_ip_domain) {
                        console.error('IP domain not allowed in production');
                        process.exit();
                    }

                    if (hasPort(network_data.api_domain)) {
                        console.error('Domain with port not allowed in production');
                        process.exit();
                    }
                }

                //prevent duplicate domains
                //rare: networks table should be empty
                try {
                    let domain_qry = await conn('networks')
                        .where('base_domain', network_data.base_domain)
                        .first();

                    if (domain_qry) {
                        console.error('Domain already exists in DB');
                        process.exit();
                    }
                } catch (e) {
                    console.error(e);
                }

                //create network record
                await conn('networks').insert(network_data);

                //notify befriend server(s) of your network
                try {
                    await module.exports.onSelfCreated(network_data);
                } catch (e) {
                    console.error(e);
                }
            } else {
                //network not registered with other networks previously
                if (!network_qry.is_network_known) {
                    try {
                        await module.exports.onSelfCreated(network_qry);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function homeDomains() {
    return new Promise(async (resolve, reject) => {
        //initiate alt domains if null
        if (module.exports.domains.alt === null) {
            try {
                await module.exports.loadAltDomains();
            } catch (e) {
                console.error(e);
            }
        }

        let home_domains = module.exports.domains.befriend.concat(module.exports.domains.alt);

        resolve(home_domains);
    });
}

function loadAltDomains() {
    return new Promise(async (resolve, reject) => {
        //only load once
        if (module.exports.domains.alt !== null) {
            return resolve();
        }

        module.exports.domains.alt = [];

        let alt_domains_key = module.exports.env.alt_domains_key;

        //check for alt befriend domains
        if (process.env[alt_domains_key]) {
            try {
                let _alt_domains = JSON.parse(process.env[alt_domains_key]);

                if (_alt_domains && Array.isArray(_alt_domains) && _alt_domains.length) {
                    for (let domain of _alt_domains) {
                        domain = getCleanDomain(domain, false, true);

                        if (domain) {
                            module.exports.domains.alt.push(domain);
                        }
                    }
                }
            } catch (e) {
                console.error({
                    env_format_invalid: alt_domains_key,
                    format: `${alt_domains_key}=["api.domain.com"]`,
                });

                process.exit();
            }
        }

        resolve();
    });
}

function onSelfCreated(network_data) {
    return new Promise(async (resolve, reject) => {
        delete network_data.id;

        let home_domains = await module.exports.homeDomains();

        for (let domain of home_domains) {
            let keys_exchange_token_self = generateToken(40);

            module.exports.keys.oneTime[keys_exchange_token_self] = null;

            try {
                let r = await axios.post(getURL(domain, `network-add`), {
                    network: network_data,
                    keys_exchange_token: keys_exchange_token_self,
                });

                if (r.status === 201) {
                    await module.exports.setSelfKnown();
                    break;
                } else {
                }
            } catch (e) {
                console.error(e);
            }
        }

        resolve();
    });
}

function setSelfKnown() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let qry = await conn('networks')
                .where('network_token', module.exports.token)
                .where('is_self', true)
                .first();

            if (!qry) {
                return reject('Self network not found');
            }

            if (qry && qry.is_network_known) {
                return reject('Network already known');
            }

            await conn('networks').where('id', qry.id).update({
                is_network_known: true,
                updated: timeNow(),
            });
        } catch (e) {
            return reject(e);
        }

        resolve();
    });
}

function getNetwork(network_id = null, network_token = null) {
    return new Promise(async (resolve, reject) => {
        if (!network_id && !network_token) {
            return reject('No network token');
        }

        try {
            let networks = await getNetworksLookup();

            if (network_id) {
                return resolve(networks.byId[network_id]);
            }

            return resolve(networks.byToken[network_token]);
        } catch (e) {
            reject(e);
        }
    });
}

function getNetworkSelf(is_frontend) {
    return new Promise(async (resolve, reject) => {
        try {
            let key = is_frontend ? 'frontend' : 'backend';

            if (module.exports.cache.self[key]) {
                return resolve(module.exports.cache.self[key]);
            }

            let cols = '*';

            if (is_frontend) {
                cols = [
                    'network_token',
                    'network_name',
                    'network_logo',
                    'app_icon',
                    'base_domain',
                    'api_domain',
                    'is_verified',
                    'is_self',
                ];
            }

            let conn = await dbService.conn();

            let qry = await conn('networks')
                .where('network_token', process.env[module.exports.env.network_token_key])
                .where('is_self', true)
                .select(cols)
                .first();

            module.exports.cache.self[key] = qry;

            resolve(qry);
        } catch (e) {
            reject(e);
        }
    });
}

function getNetworksLookup() {
    return new Promise(async (resolve, reject) => {
        try {
            let cache_key = cacheService.keys.networks;
            let networks = await cacheService.getObj(cache_key);

            if (!networks) {
                let conn = await dbService.conn();
                networks = await conn('networks');
                await cacheService.setCache(cache_key, networks);
            }

            let networks_lookup = networks.reduce(
                (acc, network) => {
                    acc.byId[network.id] = network;
                    acc.byToken[network.network_token] = network;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            resolve(networks_lookup);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getNetworksForFilters() {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.networks_filters;

        try {
            let cache_data = await cacheService.getObj(cache_key);

            if (cache_data) {
                return resolve(cache_data);
            }

            let conn = await dbService.conn();

            let networks = await conn('networks AS n')
                .where('is_active', true)
                .where('is_blocked', false)
                // .where('created', '<', timeNow() - 60000)
                .orderBy('n.is_self', 'desc')
                .orderBy('n.is_befriend', 'desc')
                .orderBy('n.is_verified', 'desc')
                .orderBy('n.priority', 'asc')
                .select(
                    'n.id',
                    'n.network_token',
                    'n.network_name',
                    'n.network_logo',
                    'n.app_icon',
                    'n.base_domain',
                    'n.api_domain',
                    'n.persons_count',
                    'n.priority',
                    'n.is_self',
                    'n.is_befriend',
                    'n.is_verified',
                    'n.is_online',
                    'n.last_online',
                    'n.created',
                    'n.updated',
                );

            let networks_lookup = networks.reduce(
                (acc, network) => {
                    acc.byId[network.id] = network;
                    acc.byToken[network.network_token] = network;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            let networks_persons = await conn('networks_persons AS np')
                .join('persons AS p', 'p.id', '=', 'np.person_id')
                .whereNull('np.deleted')
                .whereNull('p.deleted')
                .where('np.is_active', 1)
                .where('p.is_blocked', 0)
                .select('np.id', 'np.network_id', 'np.person_id');

            // Initialize dictionaries to store person IDs in buckets of 1 million
            let bucketSize = 1000 * 1000;
            let allPersonsBuckets = {};
            let verifiedPersonsBuckets = {};

            // Process all records and store in appropriate buckets
            for (let person of networks_persons) {
                const bucketIndex = Math.floor(person.person_id / bucketSize);

                // Initialize bucket if it doesn't exist
                if (!allPersonsBuckets[bucketIndex]) {
                    allPersonsBuckets[bucketIndex] = new Set();
                }

                allPersonsBuckets[bucketIndex].add(person.person_id);

                let network = networks_lookup.byId[person.network_id];

                if (network?.is_verified) {
                    if (!verifiedPersonsBuckets[bucketIndex]) {
                        verifiedPersonsBuckets[bucketIndex] = new Set();
                    }

                    verifiedPersonsBuckets[bucketIndex].add(person.person_id);
                }
            }

            // Count unique persons across all buckets
            let counts = {
                all: Object.values(allPersonsBuckets).reduce(
                    (total, bucket) => total + bucket.size,
                    0,
                ),
                verified: Object.values(verifiedPersonsBuckets).reduce(
                    (total, bucket) => total + bucket.size,
                    0,
                ),
            };

            let organized = {
                counts,
                networks,
            };

            await cacheService.setCache(cache_key, organized);

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getSyncNetworks() {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);

            resolve(networks);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function addNetwork(body) {
    return new Promise(async (resolve, reject) => {
        let conn, network_self;

        let data = body?.network;

        //for key exchange process
        let keys_new_network_token = body?.keys_exchange_token;

        let required_props = ['network_token', 'network_name', 'api_domain'];

        //check for required properties
        let missing = [];

        for (let prop of required_props) {
            if (!data?.[prop]) {
                missing.push(prop);
            }
        }

        if (!keys_new_network_token) {
            missing.push('keys_exchange_token');
        }

        if (missing.length) {
            return reject({
                missing_required_values: missing,
            });
        }

        //domain validation
        let base = tldts.parse(data.base_domain);
        let api = tldts.parse(data.api_domain);

        if (base.domain !== api.domain) {
            return reject({
                domain_mismatch: {
                    base_domain: base,
                    api_domain: api,
                },
            });
        }

        if (isProdApp()) {
            if (isIPAddress(data.base_domain) || isLocalHost(data.base_domain)) {
                return reject({
                    message: 'IP/localhost not allowed',
                    base_domain: data.base_domain,
                });
            }
        }

        //do not allow adding network on is_befriend=false network
        try {
            conn = await dbService.conn();

            network_self = await conn('networks AS n')
                .join('networks AS n2', 'n.registration_network_id', '=', 'n2.id')
                .where('n.network_token', module.exports.token)
                .where('n.is_self', true)
                .where('n.is_befriend', true)
                .select('n.*', 'n2.network_token AS registration_network_token')
                .first();

            if (!network_self) {
                return reject({
                    message: 'Could not register network',
                });
            }
        } catch (e) {
            console.error(e);
        }

        //check for existence of domain and token
        try {
            let domain_duplicate_qry = await conn('networks')
                .where('base_domain', base.hostname)
                .first();

            if (domain_duplicate_qry) {
                return reject({
                    message: 'Domain already exists',
                    base_domain: data.base_domain,
                });
            }

            let token_duplicate_qry = await conn('networks')
                .where('network_token', data.network_token)
                .first();

            if (token_duplicate_qry) {
                return reject({
                    message: 'Token already exists',
                    network_token: data.network_token,
                });
            }
        } catch (e) {
            console.error(e);
        }

        //ping network before adding to known
        try {
            let ping_url = getURL(data.api_domain, 'happy-connect');

            let r = await axios.get(ping_url);

            if (!('happiness' in r.data)) {
                return reject({
                    message: 'Missing happiness in network-add',
                });
            }

            let network_data = {
                registration_network_id: network_self.id,
                network_token: data.network_token,
                network_name: data.network_name,
                network_logo: data.network_logo || null,
                app_icon: data.app_icon || null,
                base_domain: data.base_domain,
                api_domain: data.api_domain,
                is_network_known: true,
                is_self: false,
                is_befriend: false,
                is_verified: false,
                is_blocked: false,
                is_active: false,
                is_online: true,
                last_online: timeNow(),
                admin_name: data.admin_name || null,
                admin_email: data.admin_email || null,
                created: timeNow(),
                updated: timeNow(),
            };

            //add network with is_active=false
            await conn('networks').insert(network_data);

            //delete cache after adding
            await cacheService.deleteKeys([
                cacheService.keys.networks,
                cacheService.keys.networks_public,
                cacheService.keys.networks_filters,
            ]);

            //continue key exchange process
            let secret_key_me = generateToken(40);

            let exchange_key_url = getURL(data.api_domain, 'keys/home/from');

            let keys_exchange_token_me = generateToken(40);

            module.exports.keys.oneTime[keys_exchange_token_me] = secret_key_me;

            let r2 = await axios.post(exchange_key_url, {
                network: network_self,
                secret_key_befriend: secret_key_me,
                keys_exchange_token: {
                    befriend: keys_exchange_token_me,
                    new_network: keys_new_network_token,
                },
            });

            resolve({
                message: 'Network added successfully',
                network: network_self,
            });
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error pinging api_domain during network-add',
            });
        }
    });
}

function exchangeKeysHomeFrom(body) {
    return new Promise(async (resolve, reject) => {
        //network n
        let conn;

        //saved to secret_key_from
        let befriend_network = body.network;
        let secret_key_befriend = body.secret_key_befriend;
        let keys_exchange_token = body.keys_exchange_token;

        if (
            !keys_exchange_token ||
            !keys_exchange_token.new_network ||
            !(keys_exchange_token.new_network in module.exports.keys.oneTime)
        ) {
            return reject({
                message: 'Invalid one time token',
            });
        }

        if (!befriend_network) {
            return reject({
                message: 'Missing network data',
            });
        }

        let befriend_network_id;

        //create network
        try {
            conn = await dbService.conn();

            befriend_network_id = await conn('networks').insert({
                network_token: befriend_network.network_token,
                network_name: befriend_network.network_name,
                network_logo: befriend_network.network_logo,
                app_icon: befriend_network.app_icon,
                base_domain: befriend_network.base_domain,
                api_domain: befriend_network.api_domain,
                priority: befriend_network.priority,
                keys_exchanged: false,
                is_network_known: befriend_network.is_network_known,
                is_self: false,
                is_befriend: befriend_network.is_befriend,
                is_verified: befriend_network.is_verified,
                is_blocked: befriend_network.is_blocked,
                is_online: befriend_network.is_online,
                is_active: befriend_network.is_active,
                last_online: befriend_network.last_online,
                admin_name: befriend_network.admin_name,
                admin_email: befriend_network.admin_email,
                created: timeNow(),
                updated: timeNow(),
            });

            befriend_network_id = befriend_network_id[0];
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error adding befriend network',
            });
        }

        //for own network: set registration_network_id, is_network_known
        try {
            await conn('networks')
                .where('network_token', module.exports.token)
                .where('is_self', true)
                .update({
                    registration_network_id: befriend_network_id,
                    is_network_known: true,
                    updated: timeNow(),
                });
        } catch (e) {
            console.error(e);
        }

        //set registration_network_id for just added registering network
        try {
            if (befriend_network.registration_network_token) {
                let qry = await conn('networks')
                    .where('network_token', befriend_network.registration_network_token)
                    .first();

                if (qry) {
                    await conn('networks').where('id', befriend_network_id).update({
                        registration_network_id: qry.id,
                        updated: timeNow(),
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }

        try {
            //save befriend secret key, set self secret key
            module.exports.keys.oneTime[keys_exchange_token.befriend] = secret_key_befriend;

            let secret_key_new_network = generateToken(40);

            module.exports.keys.oneTime[keys_exchange_token.new_network] = secret_key_new_network;

            await axios.post(getURL(befriend_network.api_domain, `keys/home/to`), {
                network_token: module.exports.token,
                secret_key_new_network: secret_key_new_network,
                keys_exchange_token: {
                    befriend: keys_exchange_token.befriend,
                    new_network: keys_exchange_token.new_network,
                },
            });
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function exchangeKeysHomeTo(body) {
    return new Promise(async (resolve, reject) => {
        let conn, network_qry;

        //saved to secret_key_from
        let network_token = body.network_token;
        let secret_key_new_network = body.secret_key_new_network;
        let keys_exchange_token = body.keys_exchange_token;

        if (
            !keys_exchange_token ||
            !keys_exchange_token.befriend ||
            !(keys_exchange_token.befriend in module.exports.keys.oneTime)
        ) {
            return reject({
                message: 'Invalid one time token',
            });
        }

        let secret_key_befriend = module.exports.keys.oneTime[keys_exchange_token.befriend];

        if (!secret_key_befriend) {
            return reject({
                message: 'Secret key not found',
            });
        }

        if (!secret_key_new_network) {
            return reject({
                message: 'New network secret key required',
            });
        }

        //validate token
        try {
            conn = await dbService.conn();

            network_qry = await conn('networks').where('network_token', network_token).first();

            if (!network_qry) {
                return reject({
                    message: 'Invalid network token',
                });
            }
        } catch (e) {
            console.error(e);
        }

        try {
            let r = await axios.post(getURL(network_qry.api_domain, `keys/home/save`), {
                network_token: module.exports.token,
                secret_key_befriend: secret_key_befriend,
                keys_exchange_token: {
                    befriend: keys_exchange_token.befriend,
                    new_network: keys_exchange_token.new_network,
                },
            });

            if (r.status === 201) {
                await conn('networks_secret_keys').insert({
                    network_id: network_qry.id,
                    is_active: true,
                    secret_key_from: secret_key_new_network,
                    secret_key_to: secret_key_befriend,
                    created: timeNow(),
                    updated: timeNow(),
                });

                await cacheService.hSet(cacheService.keys.networks_secrets, network_token, {
                    from: secret_key_new_network,
                    to: secret_key_befriend,
                });

                await conn('networks').where('id', network_qry.id).update({
                    keys_exchanged: true,
                    updated: timeNow(),
                });

                //delete token from memory
                delete module.exports.keys.oneTime[keys_exchange_token.befriend];
            }
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function exchangeKeysHomeSave(body) {
    return new Promise(async (resolve, reject) => {
        //network n
        let conn, network_qry;

        //saved to secret_key_from
        let network_token = body.network_token;
        let secret_key_befriend = body.secret_key_befriend;
        let keys_exchange_token = body.keys_exchange_token;

        if (
            !keys_exchange_token ||
            !keys_exchange_token.new_network ||
            !(keys_exchange_token.new_network in module.exports.keys.oneTime)
        ) {
            return reject({
                message: 'Invalid one time token',
            });
        }

        let secret_key_new_network = module.exports.keys.oneTime[keys_exchange_token.new_network];

        if (!secret_key_new_network) {
            return reject({
                message: 'Self secret key not found',
            });
        }

        if (!secret_key_befriend) {
            return reject({
                message: 'Befriend secret key required',
            });
        }

        //validate token
        try {
            conn = await dbService.conn();

            network_qry = await conn('networks').where('network_token', network_token).first();

            if (!network_qry) {
                return reject({
                    message: 'Invalid network token',
                });
            }

            await conn('networks_secret_keys').insert({
                network_id: network_qry.id,
                is_active: true,
                secret_key_from: secret_key_befriend,
                secret_key_to: secret_key_new_network,
                created: timeNow(),
                updated: timeNow(),
            });

            await cacheService.hSet(cacheService.keys.networks_secrets, network_token, {
                from: secret_key_befriend,
                to: secret_key_new_network,
            });

            await conn('networks').where('id', network_qry.id).update({
                keys_exchanged: true,
                updated: timeNow(),
            });

            //delete token from memory
            delete module.exports.keys.oneTime[keys_exchange_token.new_network];
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function keysExchangeEncrypt(body) {
    return new Promise(async (resolve, reject) => {
        //registering server/befriend

        //We enable key exchange between two networks by encrypting the to_network's network_token with their secret key stored in our database.
        //We pass the from_network's exchange_token to the to_network to authenticate the to_network's request back to the from_network.

        let my_network, from_network, to_network;

        let encrypted_network_tokens = {
            from: null,
            to: null,
        };

        let exchange_token = body.exchange_token;

        if (!exchange_token) {
            return reject({
                message: 'No exchange token provided',
            });
        }

        if (!('network_tokens' in body)) {
            return reject({
                message: 'No network tokens provided',
            });
        }

        let from_network_token = body.network_tokens.from;
        let to_network_token = body.network_tokens.to;

        if (!from_network_token || !to_network_token) {
            return reject({
                message: 'Both from and to network tokens required',
            });
        }

        //ensure the to_network was registered by us
        try {
            my_network = await getNetworkSelf();
            from_network = await getNetwork(null, from_network_token);
            to_network = await getNetwork(null, to_network_token);

            if (to_network.registration_network_id !== my_network.id) {
                return reject({
                    message: 'Could not facilitate keys exchange with to_network',
                    network_tokens: body.network_tokens,
                });
            }

            if (!from_network || !to_network) {
                return reject({
                    message: 'Could not find both networks',
                    network_tokens: body.network_tokens,
                });
            }
        } catch (e) {
            return reject({
                message: 'Error verifying networks',
            });
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

            if (!from_secret_key_qry || !to_secret_key_qry) {
                return reject({
                    message: 'Could not find keys for both networks',
                });
            }

            encrypted_network_tokens.from = await encryptionService.encrypt(
                from_secret_key_qry.secret_key_to,
                from_network_token,
            );
            encrypted_network_tokens.to = await encryptionService.encrypt(
                to_secret_key_qry.secret_key_to,
                to_network_token,
            );
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error processing tokens for keys exchange',
            });
        }

        if (!encrypted_network_tokens.from || !encrypted_network_tokens.to) {
            return reject({
                message: 'Could not encrypt tokens',
            });
        }

        try {
            let r = await axios.post(getURL(to_network.api_domain, `/keys/exchange/decrypt`), {
                exchange_token_from: exchange_token,
                encrypted: encrypted_network_tokens,
                network_tokens: body.network_tokens,
            });

            if (r.status === 201) {
                return reject({
                    message: 'Keys exchange process started successfully',
                    network_tokens: body.network_tokens,
                });
            } else {
                return reject({
                    message: 'Error communicating with to_network',
                    network_tokens: body.network_tokens,
                });
            }
        } catch (e) {
            return reject({
                message: 'Error communicating with to_network',
                network_tokens: body.network_tokens,
            });
        }
    });
}

function keysExchangeDecrypt(body) {
    return new Promise(async (resolve, reject) => {
        let from_network;

        //request received from registering/befriend network
        let exchange_token = body.exchange_token_from;
        let encrypted = body.encrypted;
        let network_tokens = body.network_tokens;

        if (!exchange_token) {
            return reject({
                message: 'Exchange token required',
            });
        }

        if (!encrypted || !encrypted.from || !encrypted.to) {
            return reject({
                message: 'Encrypted tokens required',
            });
        }

        if (!network_tokens || !network_tokens.from || !network_tokens.to) {
            return reject({
                message: 'Network token data required',
            });
        }

        try {
            await encryptionService.confirmDecryptedRegistrationNetworkToken(encrypted.to);
        } catch (e) {
            return reject({
                message: e,
            });
        }

        try {
            let conn = await dbService.conn();

            //get domain for from_network
            from_network = await getNetwork(null, network_tokens.from);

            if (!from_network) {
                return reject({
                    message: 'From network not found',
                });
            }

            //generate my secret_key for from_network
            let secret_key_self = generateToken(40);

            let r = await axios.post(getURL(from_network.api_domain, `/keys/exchange/save`), {
                exchange_token: exchange_token,
                encrypted: encrypted,
                secret_key_from: secret_key_self,
            });

            if (r.status === 201 && r.data.secret_key_from) {
                await conn(`networks_secret_keys`).insert({
                    network_id: from_network.id,
                    is_active: true,
                    secret_key_from: r.data.secret_key_from,
                    secret_key_to: secret_key_self,
                    created: timeNow(),
                    updated: timeNow(),
                });

                await cacheService.hSet(
                    cacheService.keys.networks_secrets,
                    from_network.network_token,
                    {
                        from: r.data.secret_key_from,
                        to: secret_key_self,
                    },
                );

                //set keys exchanged
                await conn('networks').where('id', from_network.id).update({
                    keys_exchanged: true,
                    updated: timeNow(),
                });
            } else {
                return reject({
                    message: 'Error exchanging keys with from_network',
                });
            }

            return resolve();
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Could not exchange keys with from_network',
            });
        }
    });
}

function keysExchangeSave(body) {
    return new Promise(async (resolve, reject) => {
        //request received on from_network

        let to_network, cache_key;

        //request received from to_network
        let exchange_token = body.exchange_token;
        let encrypted = body.encrypted;
        let secret_key_from = body.secret_key_from;

        if (!exchange_token) {
            return reject({
                message: 'Exchange token required',
            });
        }

        if (!encrypted || !encrypted.from) {
            return reject({
                message: 'Encrypted tokens required',
            });
        }

        if (!secret_key_from) {
            return reject({
                message: 'to_network secret key not provided',
            });
        }

        try {
            //retrieve to_network_token from exchange_token cache key
            cache_key = cacheService.keys.exchange_keys(exchange_token);

            let to_network_token = await cacheService.get(cache_key);

            if (!to_network_token) {
                return reject({
                    message: 'Invalid exchange token',
                });
            }

            to_network = await getNetwork(null, to_network_token);

            if (!to_network) {
                return reject({
                    message: 'Could not find to_network',
                });
            }
        } catch (e) {
            return reject({
                message: 'Error verifying networks',
            });
        }

        //confirm decrypted network token
        try {
            await encryptionService.confirmDecryptedRegistrationNetworkToken(encrypted.from);
        } catch (e) {
            return reject({
                message: e,
            });
        }

        try {
            let conn = await dbService.conn();

            let secret_key_to = generateToken(40);

            await conn('networks_secret_keys').insert({
                network_id: to_network.id,
                is_active: true,
                secret_key_from: secret_key_from,
                secret_key_to: secret_key_to,
                created: timeNow(),
                updated: timeNow(),
            });

            await cacheService.hSet(cacheService.keys.networks_secrets, to_network.network_token, {
                from: secret_key_from,
                to: secret_key_to,
            });

            //set keys exchanged
            await conn('networks').where('id', to_network.id).update({
                keys_exchanged: true,
                updated: timeNow(),
            });

            //delete exchange_token from cache
            await cacheService.deleteKeys(cache_key);

            return resolve({
                secret_key_from: secret_key_to,
                secret_key_to: secret_key_from,
            });
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error saving keys',
            });
        }
    });
}

function getSecretKeyToForNetwork(network_id = null, network_token = null) {
    return new Promise(async (resolve, reject) => {
        if (!network_id && !network_token) {
            return reject('Network id or token required');
        }

        try {
            let conn = await dbService.conn();

            if (!network_id) {
                let networksLookup = await getNetworksLookup();
                let network = networksLookup.byToken[network_token];

                if (!network) {
                    return resolve(null);
                }

                network_id = network.id;
            }

            let secret_key_to_qry = await conn('networks_secret_keys')
                .where('network_id', network_id)
                .where('is_active', true)
                .first();

            return resolve(secret_key_to_qry?.secret_key_to || null);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function getNetworkWithSecretKeyByDomain(domain) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!domain) {
                return resolve(null);
            }

            let lookup = await getNetworksLookup();

            for (let network_id in lookup.byId) {
                let network = lookup.byId[network_id];
                
                if(network.api_domain.includes(domain) || domain.includes(network.api_domain)) {
                    let secret_key = await getSecretKeyToForNetwork(network_id);
                    
                    return resolve({
                        secret_key,
                        network
                    });
                }
            }

            return resolve(null);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

function registerNewPersonHomeDomain(person) {
    return new Promise(async (resolve, reject) => {
        try {
            let networkSelf = await getNetworkSelf();

            if (networkSelf.is_befriend) {
                return resolve();
            }

            let conn = await dbService.conn();
            let home_domains = await homeDomains();
            let networksLookup = await getNetworksLookup();

            for (let domain of home_domains) {
                //do not notify own domain
                if (networkSelf.api_domain.includes(domain)) {
                    continue;
                }

                let network_to = null;

                for (let network of Object.values(networksLookup.byToken)) {
                    if (network.api_domain.includes(domain)) {
                        network_to = network;
                    }
                }

                if (!network_to) {
                    continue;
                }

                //security_key
                let secret_key_to = await getSecretKeyToForNetwork(network_to.id);

                if (!secret_key_to) {
                    continue;
                }

                let has_error = false;

                try {
                    let r = await axios.post(getURL(domain, 'networks/persons'), {
                        secret_key: secret_key_to,
                        network_token: networkSelf.network_token,
                        person_token: person.person_token,
                        updated: person.updated,
                    });

                    if (r.status === 201) {
                        await conn('persons').where('id', person.id).update({
                            is_person_known: true,
                        });
                    } else {
                        has_error = true;
                    }
                } catch (e) {
                    has_error = true;
                    console.error(e);
                }

                if (!has_error) {
                    break;
                }
            }
        } catch(e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

module.exports = {
    cols: [
        'network_token',
        'network_name',
        'network_logo',
        'app_icon',
        'base_domain',
        'api_domain',
        'priority',
        'keys_exchanged',
        'persons_count',
        'is_network_known',
        'is_self',
        'is_befriend',
        'is_verified',
        'is_active',
        'is_blocked',
        'is_online',
        'last_online',
        'admin_name',
        'admin_email',
    ],
    env: {
        alt_domains_key: 'ALT_BEFRIEND_DOMAINS',
        network_token_key: `NETWORK_TOKEN`,
    },
    token: null, //network token for self
    keys: {
        oneTime: {},
    },
    domains: {
        befriend: [`api.befriend.app`],
        alt: null,
    },
    cache: {
        self: {
            backend: null,
            frontend: null,
        },
    },
    init,
    homeDomains,
    loadAltDomains,
    onSelfCreated,
    setSelfKnown,
    getNetworksLookup,
    getNetwork,
    getNetworkSelf,
    getNetworksForFilters,
    getSyncNetworks,
    addNetwork,
    exchangeKeysHomeFrom,
    exchangeKeysHomeTo,
    exchangeKeysHomeSave,
    keysExchangeEncrypt,
    keysExchangeDecrypt,
    keysExchangeSave,
    getSecretKeyToForNetwork,
    getNetworkWithSecretKeyByDomain,
    registerNewPersonHomeDomain
};
