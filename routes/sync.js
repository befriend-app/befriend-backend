const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync');
const {confirmDecryptedNetworkToken} = require("../services/shared");
const dbService = require("../services/db");
const {getNetwork} = require("../services/network");

router.use(function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        let network_token = req.body.network_token;
        let encrypted_network_token = req.body.encrypted_network_token;

        try {
            if(!network_token) {
                res.json("network_token required", 401);
                return resolve();
            }

            let network = await getNetwork(network_token);

            if(!network) {
                res.json("network_token invalid", 401);
                return resolve();
            }

            if(network.is_blocked) {
                res.json("Cannot provide data to your network", 401);
                return resolve();
            }

            await confirmDecryptedNetworkToken(encrypted_network_token, network);

            req.from_network = network;

            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        } catch(e) {
            res.json("Invalid network_token", 401);
        }

        resolve();
    });

});

router.post('/persons', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncPersons(req, res);
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
});

module.exports = router;