let express = require('express');
let router = express.Router();
let personsController = require('../controllers/persons');

router.use(require('../middleware/auth'));

router.get('/me', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.getMe(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/me/sections', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addMeSection(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/me/sections/item', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addMeSectionItem(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/me/sections/item', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.updateMeSectionItem(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/activities', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.createActivity(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.post('/devices', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.addDevice(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

module.exports = router;
