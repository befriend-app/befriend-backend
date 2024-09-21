const axios = require('axios');
const dbService = require('../services/db');



module.exports = {
    getPersonByEmail: function (person_email) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();

                let person = await conn('networks')
                    .where('email', network_email)
                    .first();

                resolve(person);
            } catch(e) {
                reject(e);
            }
        });
    },
};