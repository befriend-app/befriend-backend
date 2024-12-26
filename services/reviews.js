let dbService = require('../services/db');

function getReviews() {
    return new Promise(async (resolve, reject) => {
        if(module.exports.data) {
            return resolve(module.exports.data);
        }

        try {
            let conn = await dbService.conn();

            let data = await conn('reviews')
                .where('is_active', true)
                .orderBy('sort_position');

            module.exports.data = data;

            return resolve(data);
        } catch(e) {
            console.error(e);
            return reject();
        }
    });
}

module.exports = {
    data: null,
    getReviews
};