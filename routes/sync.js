const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync');

router.use(function (req, res, next) {
    let valid_network_token = false;

    if(!valid_network_token) {
        res.json("Invalid network_token", 401);
    } else {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    }
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
