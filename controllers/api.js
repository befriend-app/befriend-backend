const axios = require('axios');
const tldts = require('tldts');
const activitiesService = require('../services/activities');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const encryptionService = require('../services/encryption');
const networkService = require('../services/network');
const moviesService = require('../services/movies');
const tvService = require('../services/tv');

const sectionData = require('../services/sections_data');

const { getNetwork, getNetworkSelf } = require('../services/network');
const { getPerson } = require('../services/persons');
const { getCategoriesPlaces, placesAutoComplete, travelTimes } = require('../services/places');
const { cityAutoComplete } = require('../services/locations');
const { schoolAutoComplete } = require('../services/schools');
const { getTopArtistsForGenre, musicAutoComplete } = require('../services/music');
const { getTopTeamsBySport, sportsAutoComplete } = require('../services/sports');

const {
    isProdApp,
    isIPAddress,
    isLocalHost,
    getURL,
    timeNow,
    generateToken,
    joinPaths,
    normalizeSearch,
} = require('../services/shared');
const { getActivityTypes } = require('../services/activities');
const { deleteKeys } = require('../services/cache');

module.exports = {
    getNetworks: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.networks;
                let cache_data = await cacheService.getObj(cache_key);

                if (cache_data) {
                    return resolve(cache_data);
                }

                let conn = await dbService.conn();

                let networks = await conn('networks AS n')
                    .join('networks AS n2', 'n.registration_network_id', '=', 'n2.id')
                    // .where('created', '<', timeNow() - 60000)
                    .orderBy('n.is_verified', 'desc')
                    .orderBy('n.is_befriend', 'desc')
                    .orderBy('n.priority', 'asc')
                    .select(
                        'n.network_token',
                        'n.network_name',
                        'n.network_logo',
                        'n.app_icon',
                        'n.base_domain',
                        'n.api_domain',
                        'n.persons_count',
                        'n.priority',
                        'n.is_network_known',
                        'n.is_befriend',
                        'n.is_verified',
                        'n.is_active',
                        'n.is_blocked',
                        'n.is_online',
                        'n.last_online',
                        'n.created',
                        'n.updated',
                        'n2.network_token AS registration_network_token',
                    );

                await cacheService.setCache(cache_key, cache_data);

                res.json({
                    networks: networks,
                });
            } catch (e) {
                res.json('Error getting networks', 400);
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

            let required_props = ['network_token', 'network_name', 'api_domain'];

            //check for required properties
            let missing = [];

            for (let prop of required_props) {
                if (!data[prop]) {
                    missing.push(prop);
                }
            }

            if (!keys_new_network_token) {
                missing.push('keys_exchange_token');
            }

            if (missing.length) {
                res.json(
                    {
                        missing_required_values: missing,
                    },
                    400,
                );

                return resolve();
            }

            //domain validation
            let base = tldts.parse(data.base_domain);
            let api = tldts.parse(data.api_domain);

            if (base.hostname !== api.hostname) {
                res.json(
                    {
                        domain_mismatch: {
                            base_domain: base,
                            api_domain: api,
                        },
                    },
                    400,
                );

                return resolve();
            }

            if (isProdApp()) {
                if (isIPAddress(data.base_domain) || isLocalHost(data.base_domain)) {
                    res.json(
                        {
                            message: 'IP/localhost not allowed',
                            base_domain: data.base_domain,
                        },
                        400,
                    );

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

                if (!network_self) {
                    res.json(
                        {
                            message: 'Could not register network',
                        },
                        400,
                    );

                    return resolve();
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
                    res.json(
                        {
                            message: 'Domain already exists',
                            base_domain: data.base_domain,
                        },
                        400,
                    );

                    return resolve();
                }

                let token_duplicate_qry = await conn('networks')
                    .where('network_token', data.network_token)
                    .first();

                if (token_duplicate_qry) {
                    res.json(
                        {
                            message: 'Token already exists',
                            network_token: data.network_token,
                        },
                        400,
                    );

                    return resolve();
                }
            } catch (e) {
                console.error(e);
            }

            //ping network before adding to known
            try {
                let ping_url = getURL(data.api_domain, 'happy-connect');

                let r = await axios.get(ping_url);

                if (!('happiness' in r.data)) {
                    res.json(
                        {
                            message: 'Missing happiness in network-add',
                        },
                        400,
                    );

                    return resolve();
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
                await deleteKeys(cacheService.keys.networks);

                //continue key exchange process
                let secret_key_me = generateToken(40);

                let exchange_key_url = getURL(data.api_domain, 'keys/home/from');

                let keys_exchange_token_me = generateToken(40);

                networkService.keys.oneTime[keys_exchange_token_me] = secret_key_me;

                let r2 = await axios.post(exchange_key_url, {
                    network: network_self,
                    secret_key_befriend: secret_key_me,
                    keys_exchange_token: {
                        befriend: keys_exchange_token_me,
                        new_network: keys_new_network_token,
                    },
                });

                res.json(
                    {
                        message: 'Network added successfully',
                        network: network_self,
                    },
                    201,
                );
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error pinging api_domain during network-add',
                    },
                    400,
                );
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

            if (
                !keys_exchange_token ||
                !keys_exchange_token.new_network ||
                !(keys_exchange_token.new_network in networkService.keys.oneTime)
            ) {
                res.json(
                    {
                        message: 'Invalid one time token',
                    },
                    400,
                );

                return resolve();
            }

            if (!befriend_network) {
                res.json(
                    {
                        message: 'Missing network data',
                    },
                    400,
                );

                return resolve();
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
                    last_online: befriend_network.last_online,
                    admin_name: befriend_network.admin_name,
                    admin_email: befriend_network.admin_email,
                    created: timeNow(),
                    updated: timeNow(),
                });

                befriend_network_id = befriend_network_id[0];
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error adding befriend network',
                    },
                    400,
                );

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
                networkService.keys.oneTime[keys_exchange_token.befriend] = secret_key_befriend;

                let secret_key_new_network = generateToken(40);

                networkService.keys.oneTime[keys_exchange_token.new_network] =
                    secret_key_new_network;

                await axios.post(getURL(befriend_network.api_domain, `keys/home/to`), {
                    network_token: networkService.token,
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
    },
    exchangeKeysHomeTo: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //befriend home
            let conn, network_qry;

            //saved to secret_key_from
            let network_token = req.body.network_token;
            let secret_key_new_network = req.body.secret_key_new_network;
            let keys_exchange_token = req.body.keys_exchange_token;

            if (
                !keys_exchange_token ||
                !keys_exchange_token.befriend ||
                !(keys_exchange_token.befriend in networkService.keys.oneTime)
            ) {
                res.json(
                    {
                        message: 'Invalid one time token',
                    },
                    400,
                );

                return resolve();
            }

            let secret_key_befriend = networkService.keys.oneTime[keys_exchange_token.befriend];

            if (!secret_key_befriend) {
                res.json(
                    {
                        message: 'Secret key not found',
                    },
                    400,
                );

                return resolve();
            }

            if (!secret_key_new_network) {
                res.json(
                    {
                        message: 'New network secret key required',
                    },
                    400,
                );

                return resolve();
            }

            //validate token
            try {
                conn = await dbService.conn();

                network_qry = await conn('networks').where('network_token', network_token).first();

                if (!network_qry) {
                    res.json(
                        {
                            message: 'Invalid network token',
                        },
                        400,
                    );

                    return resolve();
                }
            } catch (e) {
                console.error(e);
            }

            try {
                let r = await axios.post(getURL(network_qry.api_domain, `keys/home/save`), {
                    network_token: networkService.token,
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

                    await conn('networks').where('id', network_qry.id).update({
                        keys_exchanged: true,
                        updated: timeNow(),
                    });

                    //delete token from memory
                    delete networkService.keys.oneTime[keys_exchange_token.befriend];
                }
            } catch (e) {
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

            if (
                !keys_exchange_token ||
                !keys_exchange_token.new_network ||
                !(keys_exchange_token.new_network in networkService.keys.oneTime)
            ) {
                res.json(
                    {
                        message: 'Invalid one time token',
                    },
                    400,
                );

                return resolve();
            }

            let secret_key_new_network =
                networkService.keys.oneTime[keys_exchange_token.new_network];

            if (!secret_key_new_network) {
                res.json(
                    {
                        message: 'Self secret key not found',
                    },
                    400,
                );

                return resolve();
            }

            if (!secret_key_befriend) {
                res.json(
                    {
                        message: 'Befriend secret key required',
                    },
                    400,
                );

                return resolve();
            }

            //validate token
            try {
                conn = await dbService.conn();

                network_qry = await conn('networks').where('network_token', network_token).first();

                if (!network_qry) {
                    res.json(
                        {
                            message: 'Invalid network token',
                        },
                        400,
                    );

                    return resolve();
                }

                await conn('networks_secret_keys').insert({
                    network_id: network_qry.id,
                    is_active: true,
                    secret_key_from: secret_key_befriend,
                    secret_key_to: secret_key_new_network,
                    created: timeNow(),
                    updated: timeNow(),
                });

                await conn('networks').where('id', network_qry.id).update({
                    keys_exchanged: true,
                    updated: timeNow(),
                });

                //delete tokens from memory
                delete networkService.keys.oneTime[keys_exchange_token.new_network];
            } catch (e) {
                console.error(e);
            }

            res.json(
                {
                    message: 'Keys exchanged successfully',
                },
                201,
            );

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
                to: null,
            };

            let exchange_token = req.body.exchange_token;

            if (!exchange_token) {
                res.json(
                    {
                        message: 'No exchange token provided',
                    },
                    400,
                );

                return resolve();
            }

            if (!('network_tokens' in req.body)) {
                res.json(
                    {
                        message: 'No network tokens provided',
                    },
                    400,
                );

                return resolve();
            }

            let from_network_token = req.body.network_tokens.from;
            let to_network_token = req.body.network_tokens.to;

            if (!from_network_token || !to_network_token) {
                res.json(
                    {
                        message: 'Both from and to network tokens required',
                    },
                    400,
                );

                return resolve();
            }

            //ensure the to_network was registered by us
            try {
                my_network = await getNetworkSelf();
                from_network = await getNetwork(from_network_token);
                to_network = await getNetwork(to_network_token);

                if (to_network.registration_network_id !== my_network.id) {
                    res.json(
                        {
                            message: 'Could not facilitate keys exchange with to_network',
                            network_tokens: req.body.network_tokens,
                        },
                        400,
                    );

                    return resolve();
                }

                if (!from_network || !to_network) {
                    res.json(
                        {
                            message: 'Could not find both networks',
                            network_tokens: req.body.network_tokens,
                        },
                        400,
                    );

                    return resolve();
                }
            } catch (e) {
                res.json(
                    {
                        message: 'Error verifying networks',
                    },
                    400,
                );

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

                if (!from_secret_key_qry || !to_secret_key_qry) {
                    res.json(
                        {
                            message: 'Could not find keys for both networks',
                        },
                        400,
                    );

                    return resolve();
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

                res.json(
                    {
                        message: 'Error processing tokens for keys exchange',
                    },
                    400,
                );

                return resolve();
            }

            if (!encrypted_network_tokens.from || !encrypted_network_tokens.to) {
                res.json(
                    {
                        message: 'Could not encrypt tokens',
                    },
                    400,
                );

                return resolve();
            }

            try {
                let r = await axios.post(getURL(to_network.api_domain, `/keys/exchange/decrypt`), {
                    exchange_token_from: exchange_token,
                    encrypted: encrypted_network_tokens,
                    network_tokens: req.body.network_tokens,
                });

                if (r.status === 201) {
                    res.json(
                        {
                            message: 'Keys exchange process started successfully',
                            network_tokens: req.body.network_tokens,
                        },
                        201,
                    );
                } else {
                    res.json(
                        {
                            message: 'Error communicating with to_network',
                            network_tokens: req.body.network_tokens,
                        },
                        400,
                    );
                }
            } catch (e) {
                res.json(
                    {
                        message: 'Error communicating with to_network',
                        network_tokens: req.body.network_tokens,
                    },
                    400,
                );

                return resolve();
            }
        });
    },
    keysExchangeDecrypt: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //request received on to_network

            let from_network;

            //request received from registering/befriend network
            let exchange_token = req.body.exchange_token_from;
            let encrypted = req.body.encrypted;
            let network_tokens = req.body.network_tokens;

            if (!exchange_token) {
                res.json(
                    {
                        message: 'Exchange token required',
                    },
                    400,
                );

                return resolve();
            }

            if (!encrypted || !encrypted.from || !encrypted.to) {
                res.json(
                    {
                        message: 'Encrypted tokens required',
                    },
                    400,
                );

                return resolve();
            }

            if (!network_tokens || !network_tokens.from || !network_tokens.to) {
                res.json(
                    {
                        message: 'Network token data required',
                    },
                    400,
                );

                return resolve();
            }

            try {
                await encryptionService.confirmDecryptedRegistrationNetworkToken(encrypted.to);
            } catch (e) {
                res.json(
                    {
                        message: e,
                    },
                    400,
                );

                return resolve();
            }

            try {
                let conn = await dbService.conn();

                //get domain for from_network
                from_network = await getNetwork(network_tokens.from);

                if (!from_network) {
                    res.json(
                        {
                            message: 'From network not found',
                        },
                        400,
                    );

                    return resolve();
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

                    //set keys exchanged
                    await conn('networks').where('id', from_network.id).update({
                        keys_exchanged: true,
                        updated: timeNow(),
                    });
                } else {
                    res.json(
                        {
                            message: 'Error exchanging keys with from_network',
                        },
                        400,
                    );

                    return resolve();
                }

                res.json('Keys exchanged successfully', 201);

                return resolve();
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Could not exchange keys with from_network',
                    },
                    400,
                );

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

            if (!exchange_token) {
                res.json(
                    {
                        message: 'Exchange token required',
                    },
                    400,
                );

                return resolve();
            }

            if (!encrypted || !encrypted.from) {
                res.json(
                    {
                        message: 'Encrypted tokens required',
                    },
                    400,
                );

                return resolve();
            }

            if (!secret_key_from) {
                res.json(
                    {
                        message: 'to_network secret key not provided',
                    },
                    400,
                );

                return resolve();
            }

            try {
                //retrieve to_network_token from exchange_token cache key
                cache_key = cacheService.keys.exchange_keys(exchange_token);

                let to_network_token = await cacheService.get(cache_key);

                if (!to_network_token) {
                    res.json(
                        {
                            message: 'Invalid exchange token',
                        },
                        400,
                    );

                    return resolve();
                }

                to_network = await getNetwork(to_network_token);

                if (!to_network) {
                    res.json(
                        {
                            message: 'Could not find to_network',
                        },
                        400,
                    );

                    return resolve();
                }
            } catch (e) {
                res.json(
                    {
                        message: 'Error verifying networks',
                    },
                    400,
                );

                return resolve();
            }

            //confirm decrypted network token
            try {
                await encryptionService.confirmDecryptedRegistrationNetworkToken(encrypted.from);
            } catch (e) {
                res.json(
                    {
                        message: e,
                    },
                    400,
                );

                return resolve();
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

                //set keys exchanged
                await conn('networks').where('id', to_network.id).update({
                    keys_exchanged: true,
                    updated: timeNow(),
                });

                res.json(
                    {
                        secret_key_from: secret_key_to,
                        secret_key_to: secret_key_from,
                    },
                    201,
                );

                //delete exchange_token from cache
                await cacheService.deleteKeys(cache_key);

                return resolve();
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error saving keys',
                    },
                    400,
                );

                return resolve();
            }
        });
    },
    doLogin: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let email = req.body.email;
                let password = req.body.password;

                let person = await getPerson(null, email);

                // check if password is correct
                let validPassword = await encryptionService.compare(password, person.password);

                if (!validPassword) {
                    res.json('Invalid login', 403);
                    return resolve();
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

                res.json(
                    {
                        login_token: login_token,
                        message: 'Login Successful',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                // handle logic for different errors
                res.json('Login failed', 400);
                return reject(e);
            }
        });
    },
    getActivityTypes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await getActivityTypes();

                res.json(data);
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error getting activity types data',
                    },
                    400,
                );
            }

            return resolve();
        });
    },
    getActivityTypePlaces: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let activity_type, location;

            try {
                let activity_type_token = req.params.activity_type_token;

                if (!activity_type_token) {
                    res.json(
                        {
                            message: 'activity_type token required',
                        },
                        400,
                    );

                    return resolve();
                }

                location = req.body.location;

                if (!location || !location.map || !(location.map.lat && location.map.lon)) {
                    res.json(
                        {
                            message: 'Location required',
                        },
                        400,
                    );

                    return resolve();
                }

                let conn = await dbService.conn();

                //get fsq_ids from cache or db
                let cache_key =
                    cacheService.keys.activity_type_venue_categories(activity_type_token);

                let activity_fsq_ids = await cacheService.getObj(cache_key);

                if (!activity_fsq_ids) {
                    //get activity type by token
                    activity_type = await activitiesService.getActivityType(activity_type_token);

                    if (!activity_type) {
                        res.json(
                            {
                                message: 'Activity type not found',
                            },
                            400,
                        );

                        return resolve();
                    }

                    //get fsq ids for activity type
                    let categories_qry = await conn('activity_type_venues AS atv')
                        .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
                        .where('atv.activity_type_id', activity_type.id)
                        .where('atv.is_active', true)
                        .orderBy('atv.sort_position')
                        .select('vc.fsq_id');

                    activity_fsq_ids = categories_qry.map((x) => x.fsq_id);

                    await cacheService.setCache(cache_key, activity_fsq_ids);
                }

                try {
                    let places = await getCategoriesPlaces(activity_fsq_ids, location);

                    res.json({
                        places: places,
                    });
                } catch (e) {
                    console.error(e);

                    res.json(
                        {
                            message: 'Error getting category(s) places',
                        },
                        400,
                    );
                }
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error getting places for activity',
                    },
                    400,
                );
            }

            return resolve();
        });
    },
    getMapboxToken: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //get temporary mapbox token for use in app

            let expires_when = Date.now() + 60 * 60 * 1000;
            let expires = new Date(expires_when).toISOString();

            const tokenConfig = {
                note: 'Temporary token for accessing maps',
                expires: new Date(expires),
                scopes: [
                    'styles:tiles',
                    'styles:read', // Allow reading styles
                    'fonts:read', // Allow reading fonts
                    'datasets:read',
                    'tilesets:read', // Allow reading tilesets
                ],
            };

            try {
                const response = await axios.post(
                    `https://api.mapbox.com/tokens/v2/${process.env.MAPBOX_USER}?access_token=${process.env.MAPBOX_SECRET_KEY}`,
                    tokenConfig,
                );

                res.json(
                    {
                        expires: expires_when,
                        token: response.data.token,
                    },
                    200,
                );
            } catch (e) {
                console.error(e);

                res.json('Error getting map token', 400);
            }

            resolve();
        });
    },
    placesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { session_token, search, location, friends } = req.body;

                if (!session_token) {
                    res.json(
                        {
                            message: 'Session token required',
                        },
                        400,
                    );

                    return resolve();
                }

                if (!search || search.length < 3) {
                    res.json(
                        {
                            message: 'Search string must be at least 3 characters',
                        },
                        400,
                    );

                    return resolve();
                }

                if (!location || !location.map || !(location.map.lat && location.map.lon)) {
                    res.json(
                        {
                            message: 'Location required',
                        },
                        400,
                    );

                    return resolve();
                }

                const results = await placesAutoComplete(session_token, search, location, friends);

                res.json({
                    places: results,
                });
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Search for places error',
                    },
                    400,
                );
            }

            resolve();
        });
    },
    citiesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { search, lat, lon } = req.body;

                if (!search) {
                    res.json(
                        {
                            message: 'Search string is required',
                        },
                        400,
                    );

                    return resolve();
                }

                const results = await cityAutoComplete(search, lat, lon);

                res.json({
                    cities: results,
                });
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Autocomplete error',
                    },
                    400,
                );
            }

            resolve();
        });
    },
    getGeoCode: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let place = req.body.place;

            if (!place || !place.fsq_address_id) {
                return reject('Address id required');
            }

            let token = process.env.MAPBOX_SECRET_KEY;

            let cache_key = cacheService.keys.address_geo(place.fsq_address_id);

            try {
                let cache_data = await cacheService.getObj(cache_key);

                if (cache_data && cache_data.geo) {
                    res.json(
                        {
                            geo: cache_data.geo,
                        },
                        200,
                    );

                    return resolve();
                }
            } catch (e) {
                console.error(e);
            }

            let country = '';
            let locality = '';
            let region = '';
            let address_line_1 = '';
            let postcode = '';

            if (place.location_country) {
                country = place.location_country;
            }

            if (place.location_locality) {
                locality = `&locality=${place.location_locality}`;
            }

            if (place.location_region) {
                region = `&region=${place.location_region}`;
            }

            if (place.location_address) {
                address_line_1 = `&address_line1=${place.location_address}`;
            }

            if (place.location_postcode) {
                postcode = `&postcode=${place.location_postcode}`;
            }

            let url = `https://api.mapbox.com/search/geocode/v6/forward?country=${country}${locality}${region}${address_line_1}${postcode}&access_token=${token}`;

            try {
                const response = await axios.get(url);

                if (!response.data.features.length) {
                    res.json('No coordinates', 400);

                    return resolve();
                }

                let geo = {
                    lat: response.data.features[0].geometry.coordinates[1],
                    lon: response.data.features[0].geometry.coordinates[0],
                };

                place.location_lat = geo.lat;
                place.location_lon = geo.lon;

                await cacheService.setCache(cache_key, place);

                res.json(
                    {
                        geo: geo,
                    },
                    200,
                );
            } catch (e) {
                console.error(e);

                res.json('Error getting geocode', 400);
            }

            resolve();
        });
    },
    travelTimes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let travel_times = await travelTimes(req.body.when, req.body.from, req.body.to);

                res.json(travel_times);
            } catch (e) {
                console.error(e);
                res.json('Error getting travel times', 400);
            }
        });
    },
    instrumentsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            search = normalizeSearch(search);

            let prefix_key = cacheService.keys.instruments_prefix(search);

            try {
                let unique = {};

                let tokens = await cacheService.getSortedSetByScore(prefix_key);

                for (let token of tokens) {
                    unique[token] = true;
                }

                let pipeline = await cacheService.startPipeline();

                for (let token in unique) {
                    pipeline.hGetAll(cacheService.keys.instrument(token));
                }

                let items = await cacheService.execMulti(pipeline);

                res.json(
                    {
                        items: items,
                    },
                    200,
                );

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    musicAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;
            let location = req.query.location;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await musicAutoComplete(search, category, location);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    getTopMusicArtistsByGenre: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let genre_token = req.query.category_token;

            if (!genre_token) {
                res.json('Genre token required', 400);
                return resolve();
            }

            try {
                let items = await getTopArtistsForGenre(genre_token);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Error getting artists', 400);
                return resolve();
            }
        });
    },
    getTopTeamsBySport: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let token = req.query.category_token;

            if (!token) {
                res.json('Token required', 400);
                return resolve();
            }

            try {
                let person = await getPerson(req.query.person_token);

                if (!person) {
                    res.json('Person not found', 400);
                    return resolve();
                }

                let items = await getTopTeamsBySport(token, person.country_code);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Error getting artists', 400);
                return resolve();
            }
        });
    },
    moviesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await moviesService.moviesAutoComplete(search, category);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    getTopMoviesByCategory: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { category_token } = req.query;

                if (!category_token) {
                    return res.json({ items: [] }, 200);
                }

                // Get top movies based on category
                const items = await moviesService.getTopMoviesByCategory(category_token, true);

                // Format response
                const formattedItems = items.map((movie) => ({
                    token: movie.token,
                    name: movie.name,
                    poster: movie.poster,
                    release_date: movie.release_date,
                    label: movie.label,
                    meta: movie.meta,
                    popularity: movie.popularity,
                    vote_count: movie.vote_count,
                    vote_average: movie.vote_average,
                }));

                res.json(
                    {
                        items: formattedItems,
                    },
                    200,
                );
            } catch (e) {
                console.error('Error getting top movies by category:', e);
                res.json({ error: 'Error getting movies' }, 400);
            }

            resolve();
        });
    },
    getTopShowsByCategory: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { category_token } = req.query;

                if (!category_token) {
                    return res.json({ items: [] }, 200);
                }

                // Get top shows based on category
                const items = await tvService.getTopShowsByCategory(category_token, true);

                // Format response
                const formattedItems = items.map((show) => ({
                    token: show.token,
                    name: show.name,
                    poster: show.poster,
                    first_air_date: show.first_air_date,
                    year_from: show.year_from,
                    year_to: show.year_to,
                    label: show.label,
                    meta: show.meta,
                    popularity: show.popularity,
                    vote_count: show.vote_count,
                    vote_average: show.vote_average,
                }));

                res.json(
                    {
                        items: formattedItems,
                    },
                    200,
                );
            } catch (e) {
                console.error('Error getting top TV shows by category:', e);
                res.json({ error: 'Error getting TV shows' }, 400);
            }

            resolve();
        });
    },
    schoolsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let countryId = req.query.filterId;
            let search = req.query.search;
            let location = req.query.location;

            if (!countryId || !search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await schoolAutoComplete(countryId, search, location);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    sportsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let person = await getPerson(req.query.person_token);

                let items = await sportsAutoComplete(search, category, person?.country_code);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    TVAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await tvService.tvShowsAutoComplete(search, category);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    workAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let section_data = sectionData.work;
                let search_term = normalizeSearch(search);

                if (search_term.length < section_data.autoComplete.minChars) {
                    return resolve([]);
                }

                let results = {
                    industries: [],
                    roles: [],
                };

                // Get industries and roles from cache
                const [industries, roles] = await Promise.all([
                    cacheService.hGetAllObj(cacheService.keys.work_industries),
                    cacheService.hGetAllObj(cacheService.keys.work_roles),
                ]);

                // Function to calculate match score
                function calculateMatchScore(name, searchTerm) {
                    const nameLower = name.toLowerCase();
                    if (nameLower === searchTerm) return 1;
                    if (nameLower.startsWith(searchTerm)) return 0.8;
                    if (nameLower.includes(searchTerm)) return 0.6;
                    return 0;
                }

                // Process industries
                for (const [token, industryData] of Object.entries(industries)) {
                    // Skip if not visible or deleted
                    if (!industryData.is_visible || industryData.deleted) continue;

                    const score = calculateMatchScore(industryData.name, search_term);

                    if (score > 0) {
                        results.industries.push({
                            token: token,
                            name: industryData.name,
                            table_key: 'industries',
                            label: 'Industry',
                            score: score,
                        });
                    }
                }

                // Process roles
                for (const [token, roleData] of Object.entries(roles)) {
                    // Skip if not visible or deleted
                    if (!roleData.is_visible || roleData.deleted) continue;

                    const score = calculateMatchScore(roleData.name, search_term);

                    if (score > 0) {
                        results.roles.push({
                            token: token,
                            name: roleData.name,
                            table_key: 'roles',
                            label: 'Role',
                            category_token: roleData.category_token,
                            category_name: roleData.category_name,
                            score: score,
                        });
                    }
                }

                // Sort results by:
                // 1. Score (higher first)
                // 2. Name (alphabetically)
                for (let k in results) {
                    results[k].sort((a, b) => {
                        if (b.score !== a.score) {
                            return b.score - a.score;
                        }
                        return a.name.localeCompare(b.name);
                    });
                }

                // Only take top results
                res.json({
                    items: results.industries.concat(results.roles),
                });
            } catch (e) {
                console.error(e);
                res.json('Autocomplete error', 400);
            }

            resolve();
        });
    },
};
