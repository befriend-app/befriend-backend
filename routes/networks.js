const express = require('express');
const router = express.Router();
const networksApiController = require('../controllers/networks/api');
const activitiesController = require('../controllers/activities');

router.use(require('../middleware/networks'));


router.post('/persons', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.createPerson(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.post('/activities/notifications', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.sendNotifications(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

router.put('/activities/:activity_token/notification/spots', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.putNotificationSpots(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/activities/:activity_token/notification/accept', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.putAcceptNotification(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

router.put('/activities/:activity_token/notification/decline', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.putDeclineNotification(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});


module.exports = router;
