let express = require('express');
let router = express.Router();

router.post('/:id/activity', function(req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(req.params.id);
            res.json("hapiness unlimited",200);
        } catch (err) {

        }
        resolve();
    });
});

module.exports = router;