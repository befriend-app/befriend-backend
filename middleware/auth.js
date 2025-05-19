const { isAuthenticated } = require('../services/account');

// authentication middleware
module.exports = function (req, res, next) {
    return new Promise(async (resolve, reject) => {
        try {
            let person_token = req.body.person_token || req.query.person_token;
            let login_token = req.body.login_token || req.query.login_token;

            if (typeof person_token !== 'string' || typeof login_token !== 'string') {
                res.json(
                    {
                        message: 'Invalid login parameters',
                    },
                    401,
                );

                return resolve();
            }

            let is_authenticated = await isAuthenticated(person_token, login_token);

            if (!is_authenticated) {
                res.json(
                    {
                        message: 'Invalid login',
                    },
                    401,
                );

                return resolve();
            }

            //continue authenticated request
            next();
        } catch (e) {
            res.json('Invalid login', 401);
        }

        resolve();
    });
};
