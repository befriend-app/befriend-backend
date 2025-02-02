let express = require('express');
let router = express.Router();

let activitiesController = require('../controllers/activities');
let apiController = require('../controllers/api');

router.get('/', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        res.json({
            happiness: 'unlimited',
        });

        resolve();
    });
});

router.post('/login', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        //person login
        try {
            await apiController.doLogin(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/happy-connect', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        res.json({
            happiness: 'unlimited',
        });

        resolve();
    });
});

router.get('/networks', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getNetworks(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/network-add', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.addNetwork(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/home/from', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.exchangeKeysHomeFrom(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/home/to', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.exchangeKeysHomeTo(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/home/save', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.exchangeKeysHomeSave(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/exchange/encrypt', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.keysExchangeEncrypt(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/exchange/decrypt', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.keysExchangeDecrypt(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/keys/exchange/save', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.keysExchangeSave(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/activity_types', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getActivityTypes(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.put('/activity_type/:activity_type_token/places', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getActivityTypePlaces(req, res);
        } catch (e) {
            console.error(e);
        }
        resolve();
    });
});

router.get('/activities/networks/notifications/:activity_token/:access_token', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await activitiesController.getActivityNotificationWithAccessToken(req, res);
        } catch (e) {
            console.error(e);
        }
        resolve();
    });
});

router.get('/mapbox/token', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getMapboxToken(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/autocomplete/places', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.placesAutoComplete(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/autocomplete/cities', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.citiesAutoComplete(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/geocode', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.getGeoCode(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/travel-time', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await apiController.travelTimes(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

module.exports = router;
