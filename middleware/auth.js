const cacheService = require('../services/cache');
const personsService = require('../services/persons');

// authentication middleware
module.exports = function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            let is_authenticated = await personsService.isAuthenticated(req.body.person_token, req.body.login_token);

            if (!is_authenticated) {
                res.json(
                    {
                        message: 'Invalid login',
                    },
                    401,
                );

                return resolve();
            }

            //continue request to auth route
            next();
        } catch (e) {
            res.json('Invalid login', 401);
        }

        resolve();
    });
};
