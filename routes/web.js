let express = require('express');
let router = express.Router();

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

router.get('/hash-test', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            let start_id = 2118620;
            let cities = 30000;

            let pipeline = require('../services/cache').startPipeline();

            for (let i = start_id; i < cities + start_id; i++) {
                pipeline.hGet(require('../services/cache').keys.cities_country('US'), i.toString());
            }

            let r = await require('../services/cache').execPipeline(pipeline);

            console.log();
        } catch (e) {
            console.error(e);
        }

        res.json();

        resolve();
    });
});

router.get('/review-venues', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        let conn = await require('../services/db').conn();

        let qry = await conn('activity_type_venues AS atv')
            .join('activity_types AS at', 'at.id', '=', 'atv.activity_type_id')
            .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
            .orderBy('atv.sort_position');

        let organized = {};

        for (let item of qry) {
            if (!(item.activity_type_id in organized)) {
                organized[item.activity_type_id] = {
                    id: item.activity_type_id,
                    name: item.activity_name_full,
                    venues: [],
                };
            }

            organized[item.activity_type_id].venues.push(item);
        }

        let html = `
        <style>
            .activities {
                display: flex;
                gap: 30px 30px;
                flex-wrap: wrap;
            }
            
            .name {
                font-size: 20px;
            }
        </style>
        
        `;

        for (let k in organized) {
            let d = organized[k];

            let venues_html = ``;

            for (let v of d.venues) {
                venues_html += `<div class="venue">${v.category_name} - ${v.venue_category_id}</div>`;
            }

            html += `<div class="activity"><div class="name">${d.name} - ${d.id}</div><div class="venues">${venues_html}</div></div>`;
        }

        res.send(`<div class="activities">${html}</div>`);

        resolve();
    });
});

module.exports = router;
