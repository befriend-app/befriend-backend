const axios = require('axios');
const dbService = require('../services/db');

const {joinPaths, getRepoRoot, readFile, generateToken, writeFile, isProdApp, timeNow, getCleanDomain,
    isIPAddress, getURL, hasPort
} = require("./shared");


module.exports = {
    token: null, //network token for self
    domains: {
        befriend: [`api.befriend.app`],
        alt: []
    },
    homeDomains: function () {
        return module.exports.domains.befriend.concat(module.exports.domains.alt);
    },
    init: function () {
        return new Promise(async (resolve, reject) => {
            //check for alt befriend domains
            if(process.env.ALT_BEFRIEND_DOMAINS) {
                try {
                    let _alt_domains = JSON.parse(process.env.ALT_BEFRIEND_DOMAINS);

                    if(_alt_domains && Array.isArray(_alt_domains) && _alt_domains.length) {
                        for(let domain of _alt_domains) {
                            domain = getCleanDomain(domain, true);

                            if(domain) {
                                module.exports.domains.alt.push(domain);
                            }
                        }
                    }
                } catch(e) {
                    console.error({
                        env_format_invalid: "ALT_BEFRIEND_DOMAINS",
                        format: `ALT_BEFRIEND_DOMAINS=["api.domain.com"]`
                    });

                    process.exit();
                }
            }

            let env_network_key = `NETWORK_TOKEN`;

            let conn;

            try {
                conn = await dbService.conn();
            } catch(e) {
                console.error(e);
            }

            //get/create network token for self
            let network_token = process.env[env_network_key];

            if(!network_token) {
                let env_path = joinPaths(getRepoRoot(), '.env');
                let env_data;

                try {
                    env_data = await readFile(env_path);
                } catch(e) {
                    console.error(".env file required");
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
                } catch(e) {
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

                if(!network_qry) {
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
                        updated: timeNow()
                    };

                    if(!network_data.network_name) {
                        missing.push('NETWORK_NAME');
                    }

                    if(!network_data.api_domain) {
                        missing.push('NETWORK_API_DOMAIN');
                    }

                    if(!network_data.admin_name) {
                        // missing.push('ADMIN_NAME');
                    }

                    if(!network_data.admin_email) {
                        // missing.push('ADMIN_EMAIL');
                    }
                    
                    if(network_data.network_name && network_data.network_name.startsWith('<')) {
                        invalid.push("NETWORK_NAME");
                    }

                    if(network_data.network_logo && network_data.network_logo.startsWith('<')) {
                        invalid.push("NETWORK_LOGO");
                    }

                    if(network_data.api_domain && network_data.api_domain.startsWith('<')) {
                        invalid.push("NETWORK_API_DOMAIN");
                    }

                    if(missing.length || invalid.length) {
                        if(missing.length) {
                            console.error({
                                message: '.env keys needed',
                                required: missing
                            });    
                        }
                        
                        if(invalid.length) {
                            console.error({
                                message: 'invalid .env key values',
                                invalid: invalid
                            });
                        }

                        process.exit();
                    }

                    //Do not allow ip's and ports in prod
                    if(isProdApp()) {
                        let is_ip_domain = isIPAddress(network_data.api_domain);

                        if(is_ip_domain) {
                            console.error("IP domain not allowed in production");
                            process.exit();
                        }

                        if(hasPort(network_data.api_domain)) {
                            console.error("Domain with port not allowed in production");
                            process.exit();
                        }
                    }

                    //prevent duplicate domains
                    //rare: networks table should be empty
                    try {
                        let domain_qry = await conn('networks')
                            .where('base_domain', network_data.base_domain)
                            .first();

                        if(domain_qry) {
                            console.error("Domain already exists in DB");
                            process.exit();
                        }
                    } catch(e) {
                        console.error(e);
                    }

                    //create network record
                    await conn('networks')
                        .insert(network_data);

                    //notify befriend server(s) of your network
                    try {
                        await module.exports.onSelfCreated(network_data);
                    } catch(e) {
                        console.error(e);
                    }
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    },
    onSelfCreated: function(network_data) {
        return new Promise(async (resolve, reject) => {
            let home_domains = module.exports.homeDomains();

            for(let domain of home_domains) {
                try {
                    let r = await axios.post(getURL(domain, `network-add`), {
                        network_data
                    });
                } catch(e) {
                    console.error(e);
                }
            }
        });
    }
};