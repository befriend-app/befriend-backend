const dbService = require('../services/db');
const {joinPaths, getRepoRoot, readFile, generateToken, writeFile, isLocalApp, isProdApp, timeNow} = require("./shared");

module.exports = {
    token: null, //this network's token
    init: function () {
        return new Promise(async (resolve, reject) => {
            let conn;

            try {
                conn = await dbService.conn();
            } catch(e) {
                console.error(e);
            }

            //get/create network token for self
            if(!process.env.NETWORK_TOKEN) {
                let env_path = joinPaths(getRepoRoot(), '.env');
                let env_network_key = `NETWORK_TOKEN`;
                let env_data;

                try {
                    env_data = await readFile(env_path);
                } catch(e) {
                    console.error(".env file required");
                    process.exit();
                }

                try {
                    let env_lines = env_data.split('\n');
                    let token = generateToken(24);
                    module.exports.token = token;

                    let token_line = `${env_network_key}=${token}`;
                    env_lines.push(token_line);

                    let new_env_data = env_lines.join('\n');
                    await writeFile(env_path, new_env_data);
                } catch(e) {
                    console.error(e);
                }
            } else {
                module.exports.token = process.env.NETWORK_TOKEN;
            }

            //check for existence of network token on self
            try {
                let network_qry = await conn('networks')
                    .where('network_token', module.exports.token)
                    .where('is_self', true)
                    .first();

                if(!network_qry) {
                    //check for all required values before creating record
                    let missing = [];

                    if(!(process.env.NETWORK_NAME)) {
                        missing.push('NETWORK_NAME');
                    }

                    if(!(process.env.NETWORK_API_DOMAIN)) {
                        missing.push('NETWORK_API_DOMAIN');
                    }

                    if(!process.env.ADMIN_NAME) {
                        missing.push('ADMIN_NAME');
                    }

                    if(!process.env.ADMIN_EMAIL) {
                        missing.push('ADMIN_EMAIL');
                    }

                    if(missing.length) {
                        console.error({
                            message: '.env keys needed',
                            required: missing
                        });

                        process.exit();
                    }

                    let api_domain = process.env.NETWORK_API_DOMAIN;

                    //remove http, https
                    api_domain = api_domain.replace('https://', '').replace('http://', '');

                    //handle local ip's
                    if(!isLocalApp()) {
                        //remove port
                        let domain_no_port = api_domain.split(':')[0];
                        let ip_re = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

                        let is_ip = domain_no_port.match(ip_re);

                        if(is_ip) {
                            console.error("IP domain not allowed in production");
                            process.exit();
                        }
                    }

                    //prevent duplicate domains
                    let domain = require('psl').parse(api_domain).domain;

                    try {
                        let domain_qry = await conn('networks')
                            .where('base_domain', domain)
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
                        .insert({
                            network_token: module.exports.token,
                            network_name: process.env.NETWORK_NAME,
                            network_logo: process.env.NETWORK_LOGO ? process.env.NETWORK_LOGO: null,
                            base_domain: domain,
                            api_domain: process.env.NETWORK_API_DOMAIN,
                            is_self: true,
                            is_trusted: true,
                            is_online: true,
                            last_online: timeNow(),
                            admin_name: process.env.ADMIN_NAME,
                            admin_email: process.env.ADMIN_EMAIL,
                            created: timeNow(),
                            updated: timeNow()
                        });
                }
            } catch(e) {
                console.error(e);
            }

            resolve();
        });
    }
};