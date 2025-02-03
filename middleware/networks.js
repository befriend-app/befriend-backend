const { getNetwork } = require('../services/network');
const cacheService = require('../services/cache');


module.exports = function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        if(['/networks', '/networks/'].includes(req.originalUrl)) {
            next();
            return resolve();
        }

        let network_token = req.body.network_token || req.query.network_token;
        let secret_key = req.body.secret_key || req.query.secret_key;

        try {
            if (!network_token) {
                res.json('network_token required', 401);
                return resolve();
            }

            if(!secret_key) {
                res.json('secret key required', 401);
                return resolve();
            }

            let network = await getNetwork(null, network_token);

            if (!network) {
                res.json('network_token invalid', 401);
                return resolve();
            }

            if (network.is_blocked) {
                res.json('Cannot provide data to this network', 401);
                return resolve();
            }

            let network_secrets = await cacheService.hGetItem(cacheService.keys.networks_secrets, network_token);

            if(network_secrets?.from !== secret_key) {
                res.json('invalid secret key', 401);
                return resolve();
            }

            req.from_network = network;

            next();
        } catch (e) {
            res.json('Invalid network_token', 401);
        }

        resolve();
    });
};
