

const cacheService = require('../services/cache'); // TODO: implement cache service
const dbService = require('../services/db');
const {getPerson} = require('../services/person');


// authentication middleware for /persons
module.exports = function(req, res, next) {
    return new Promise(async (resolve, reject) => {
        // need to get our network ID from persons network table

        let person_token = req.body.person_token;
        let auth_token = req.body.auth_token;

        try {
            let conn = await dbService.conn();



            
            
            next();
        } catch(e) {
            res.json("Invalid network_token", 401);
        }

        resolve();
    });
}