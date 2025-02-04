const matchingService = require('../../services/matching');
const { isNumeric } = require('../shared');


module.exports = {
    excludeMatches: function(from_network, person, activity_location, person_tokens) {
        return new Promise(async (resolve, reject) => {
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
                 let excluded = await matchingService.getMatches(
                     person, {
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
                    excluded: excluded.send
                });
            } catch(e) {
                console.error(e);
                return reject();
            }

            resolve();
        });
    }
};