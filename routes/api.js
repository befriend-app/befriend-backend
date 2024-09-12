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

module.exports = router;
