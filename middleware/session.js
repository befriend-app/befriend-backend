let cacheService = require('../services/cache');

const {generateToken, getSessionKey, timeNow} = require('../services/shared');


function getSessionData(key) {
    return new Promise(async (resolve, reject) => {
        try {
            let data = await cacheService.get(getSessionKey(key), true);

            resolve(data);
        } catch(e) {
            return reject(e);
        }
    });
}

function isSessionExpired(session_check) {
    return new Promise(async (resolve, reject) => {
        if(!session_check || !session_check.expires) {
            return resolve(true);
        }

        return resolve(session_check.expires < timeNow());
    });

}

async function handleSession(req, res, next) {
    return new Promise(async (resolve, reject) => {

        // req.app.locals.user = null;

        function createSession() {
            return new Promise(async (resolve, reject) => {

                let session_str = generateToken(20);

                //check for existence in rare  cases
                try {
                    let check = await cacheService.get(getSessionKey(session_str));

                    if(check) {
                        await createSession();
                        return resolve();
                    }
                } catch(e) {
                    console.error(e);
                }

                let session_lifetime = Number.parseInt(process.env.SESSION_LIFETIME); //seconds

                let expires = timeNow() + session_lifetime;

                try {
                    await setCookie(res, session_str, session_lifetime * 1000);
                } catch(e) {
                    console.error(e);
                }

                let data = {
                    key: session_str,
                    expires: expires
                };

                try {
                    await cacheService.setCache(getSessionKey(session_str), data, session_lifetime);
                } catch(e) {
                    return reject(e);
                }

                try {
                    await setSessionData(data);
                } catch(e) {
                    return reject(e);
                }

                return resolve();
            });
        }

        function setSessionData(data) {
            return new Promise(async (resolve, reject) => {
                if(!req.app.locals.SESSION) {
                    req.app.locals.SESSION = {};
                }

                req.app.locals.SESSION = data;

                // if(data && data.user) {
                //     req.app.locals.user = data.user;
                // }

                return resolve();
            });
        }

        let session_str = null;

        let cookie = req.cookies['SESSION'];

        if(cookie) {
            session_str = cookie;
        }

        let user_agent = req.headers['user-agent'];

        if(user_agent && user_agent.includes('ELB-HealthChecker')) {
            return resolve(next());
        }

        if(!session_str) {
            try {
                await createSession();
            } catch(e) {
                return resolve(next());
            }
        } else {
            try {
                let session_check = await getSessionData(session_str);

                //possible session invalidation logic
                let invalid_session = false;

                if(await isSessionExpired(session_check) || invalid_session) {
                    try {
                        await createSession();
                    } catch(e) {
                        return resolve(next());
                    }
                } else {
                    try {
                        await setSessionData(session_check);
                    } catch(e) {
                        return resolve(next());
                    }
                }
            } catch(e) {
                return resolve(next());
            }
        }

        return resolve(next());
    });
}

function setCookie(res, session_str, expires_in) {
    return new Promise(async (resolve, reject) => {
        if(!session_str) {
            return reject("No session str");
        }

        if(!expires_in) {
            return reject("No expires in");
        }

        let options = {
            maxAge: expires_in
        }

        // Set cookie
        res.cookie('SESSION', session_str, options);

        return resolve();
    });
}

function getSessionKeyValue(req, key) {
    return new Promise(async (resolve, reject) => {
        let session_data = req.app.locals.SESSION;

        if(!session_data) {
            return resolve(null);
        }

        let session_key = getSessionKey(session_data.key);

        try {
            let session = await cacheService.get(session_key, true);

            return resolve(session[key]);
        } catch(e) {
            console.error(e);
            return resolve(null);
        }
    });
}

function setSessionKeyValue(req, key, val) {
    return new Promise(async (resolve, reject) => {
        let session_data = req.app.locals.SESSION;

        if(!session_data) {
            return resolve(null);
        }

        let session_key = getSessionKey(session_data.key);

        try {
            let session = await cacheService.get(session_key, true);
            session[key] = val;

            await cacheService.setCache(session_key, session, session.expires - timeNow());

            return resolve();
        } catch(e) {
            console.error(e);
            return resolve(null);
        }
    });
}

function deleteSessionUser(req, res) {
    return new Promise(async (resolve, reject) => {
        let session_data = req.app.locals.SESSION;

        let session_key = getSessionKey(session_data.key);

        try {
            await cacheService.deleteKeys(session_key);
        } catch(e) {
            console.error(e);
        }

        return resolve();
    });
}

module.exports = {
    handle: handleSession,
    getSessionKeyValue: getSessionKeyValue,
    setSessionKeyValue: setSessionKeyValue,
    deleteSessionUser: deleteSessionUser
};
