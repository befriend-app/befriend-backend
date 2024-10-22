const axios = require('axios');
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

module.exports = {
    cols: [
        'network_token',
        'network_name',
        'network_logo',
        'base_domain',
        'api_domain',
        'priority',
        'keys_exchanged',
        'is_network_known',
        'is_self',
        'is_befriend',
        'is_trusted',
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
    homeDomains: function () {
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
    },
    loadAltDomains: function () {
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
                            domain = getCleanDomain(domain, true, true);

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
    },
    loadNetworkToken: function () {
        return new Promise(async (resolve, reject) => {});
    },
    init: function () {
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
                    network_token = generateToken(24);
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
                        api_domain: getCleanDomain(process.env.NETWORK_API_DOMAIN),
                        base_domain: getCleanDomain(process.env.NETWORK_API_DOMAIN, true),
                        is_self: true,
                        is_trusted: true,
                        is_online: true,
                        last_online: timeNow(),
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
                        // missing.push('ADMIN_NAME');
                    }

                    if (!network_data.admin_email) {
                        // missing.push('ADMIN_EMAIL');
                    }

                    if (network_data.network_name && network_data.network_name.startsWith('<')) {
                        invalid.push('NETWORK_NAME');
                    }

                    if (network_data.network_logo && network_data.network_logo.startsWith('<')) {
                        invalid.push('NETWORK_LOGO');
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

                    //Do not allow ip's and ports in prod
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
    },
    onSelfCreated: function (network_data) {
        return new Promise(async (resolve, reject) => {
            delete network_data.id;

            let home_domains = await module.exports.homeDomains();

            for (let domain of home_domains) {
                let keys_exchange_token_self = generateToken(30);

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
    },
    setSelfKnown: function () {
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
    },
    getNetwork: function (network_token) {
        return new Promise(async (resolve, reject) => {
            if (!network_token) {
                return reject('No network token');
            }

            try {
                let conn = await dbService.conn();

                let qry = await conn('networks').where('network_token', network_token).first();

                resolve(qry);
            } catch (e) {
                reject(e);
            }
        });
    },
    getNetworkSelf: function () {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();

                let qry = await conn('networks')
                    .where('network_token', process.env[module.exports.env.network_token_key])
                    .where('is_self', true)
                    .first();

                resolve(qry);
            } catch (e) {
                reject(e);
            }
        });
    },
};
