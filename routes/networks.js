const express = require('express');
const router = express.Router();
const networksApiController = require('../controllers/networks/api');

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


module.exports = router;
