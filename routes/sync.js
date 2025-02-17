const express = require('express');
const router = express.Router();
const syncController = require('../controllers/networks/sync');

router.use(require('../middleware/networks'));

router.get('/activities', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncActivities(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/networks-persons', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncNetworksPersons(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/persons', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncPersons(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/persons/filters', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncPersonsFilters(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/persons/modes', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncPersonsModes(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.get('/persons/me', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncMe(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

module.exports = router;
