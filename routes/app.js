let express = require("express");
let router = express.Router();
let personsController = require("../controllers/persons");

router.use(require("../middleware/auth"));

router.post("/activities", function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await personsController.createActivity(req, res);
        } catch (err) {
            console.log(err);
        }

        resolve();
    });
});

module.exports = router;
