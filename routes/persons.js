let express = require('express');
let router = express.Router();

let personsController = require('../controllers/persons');

router.post('/activities', function(req, res, next) {
    return new Promise(async (resolve, reject) => {

        await personsController.createActivity(req, res);

        try {
            console.log(req.params.id);
            res.json("hapiness unlimited",200);
        } catch (err) {

        }
        resolve();
    });
});

module.exports = router;