router.use(function (req, res, next) {
    return new Promise(async (resolve, reject) => {
    

        try {
            next();
        } catch(e) {
            res.json("", 401);
        }

        resolve();
    });

});