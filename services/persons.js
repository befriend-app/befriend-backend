const dbService = require('../services/db');


module.exports = {
    getPersonByEmail: function (person_email) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();

                let person = await conn('persons')
                    .where('email', person_email)
                    .first();

                resolve(person);
            } catch(e) {
                reject(e);
            }
        });
    },
};