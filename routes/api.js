let express = require('express');
let router = express.Router();

let apiController = require('../controllers/api');


router.get('/', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        res.json({
           happiness: 'unlimited'
        });

        resolve();
    });
});

router.get('/networks', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
             await apiController.getNetworks(req, res);
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/network-add', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.addNetwork(req, res);
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
});



module.exports = router;
