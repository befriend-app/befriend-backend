let dbService = require('../services/db');


function getReviewsLookup() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.data) {
            return resolve(module.exports.data);
        }

        let lookup = {
            byId: {},
            byToken: {},
        };

        try {
            let conn = await dbService.conn();

            let data = await conn('reviews')
                .where('is_active', true)
                .orderBy('sort_position');

            for(let review of data) {
                lookup.byId[review.id] = review;
                lookup.byToken[review.token] = review;
            }

            module.exports.data = lookup;

            return resolve(lookup);
        } catch (e) {
            console.error(e);
            return reject();
        }
    });
}

module.exports = {
    filters: {
        default: 4.5,
    },
    data: null,
    getReviewsLookup,
};
