const express = require('express');
const router = express.Router();
const networksApiController = require('../controllers/networks/api');

router.use(require('../middleware/networks'));


router.put('/activities/matching/exclude', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        //3rd-party network to my network to find persons that would be excluded by distance

        try {
            await networksApiController.activityMatchingExclude(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

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

router.put('/activities/:activity_token', function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await networksApiController.putActivity(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});


module.exports = router;
