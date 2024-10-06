const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync");

router.use(require("../middleware/sync"));

router.post("/persons", function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            await syncController.syncPersons(req, res);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
});

module.exports = router;
