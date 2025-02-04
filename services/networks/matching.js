const matchingService = require('../../services/matching');
const { isNumeric } = require('../shared');
const { getPerson } = require('../persons');


module.exports = {
    excludeMatches: function(from_network, person_data, activity_location, person_tokens) {
        return new Promise(async (resolve, reject) => {
            if(!person_data?.person_token || !person_data.grid?.token) {
                return reject('Person token and grid required');
            }
            if(!activity_location) {
                return reject('Activity field missing');
            }

            if(!isNumeric(activity_location.lat) || isNumeric(!activity_location.lon)) {
                return reject('Activity lat/lon required');
            }

            if(!Array.isArray(person_tokens)) {
                return reject("Person tokens required");
            }

            try {
                let person = await getPerson(person_data.person_token);

                if(!person) {
                    return reject('Person not found');
                }

                 let excluded = await matchingService.getMatches(
                     {
                         ...person_data,
                         id: person.id,
                         timezone: person.timezone,
                     }, {
                         location: {
                             lat: activity_location.lat,
                             lon: activity_location.lon
                         },
                         send_only: true,
                         exclude_only: true
                    },
                     ['distance'],
                     person_tokens
                 );

                resolve({
                    excluded: Array.from(excluded.send)
                });
            } catch(e) {
                console.error(e);
                return reject();
            }

            resolve();
        });
    }
};