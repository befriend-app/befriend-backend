const dbService = require('../services/db');
const {joinPaths, getRepoRoot, readFile, generateToken, writeFile, isLocalApp, isProdApp, timeNow, getCleanDomain,
    isIPAddress
} = require("./shared");

module.exports = {
    token: null, //this network's token
    init: function () {
        return new Promise(async (resolve, reject) => {
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

                    if(missing.length) {
                        console.error({
                            message: '.env keys needed',
                            required: missing
                        });

                        process.exit();
                    }

                    //local ip's: dev only
                    if(isProdApp()) {
                        let is_ip_domain = isIPAddress(network_data.api_domain);

                        if(is_ip_domain) {
                            console.error("IP domain not allowed in production");
                            process.exit();
                        }
                    }

                    //prevent duplicate domains
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
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    }
};