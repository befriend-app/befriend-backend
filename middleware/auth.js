const cacheService = require("../services/cache");
const { getPersonLoginCacheKey } = require("../services/shared");

// authentication middleware
module.exports = function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        let person_token = req.body.person_token;
        let login_token = req.body.login_token;

        try {
            let cache_key = getPersonLoginCacheKey(person_token);

            let is_valid_token = await cacheService.isSetMember(cache_key, login_token);

            if (!is_valid_token) {
                res.json(
                    {
                        message: "unauthenticated request",
                    },
                    401,
                );

                return resolve();
            }

            //continue request to auth route
            next();
        } catch (e) {
            res.json("Invalid network_token", 401);
        }

        resolve();
    });
};
