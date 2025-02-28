let dbService = require('../services/db');
const { timeNow } = require('./shared');


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

function getPersonReviews(person) {
    return new Promise(async (resolve, reject) => {
        try {
             let conn = await dbService.conn();

             let reviewsLookup = await getReviewsLookup();

             let threshold = timeNow() - 7 * 24 * 3600 * 1000;

             let reviewsQry = await conn('activities_persons_reviews AS apr')
                 .join('persons AS p', 'p.id', '=', 'apr.person_to_id')
                 .where('person_from_id', person.id)
                 .where('apr.created', '>', threshold)
                 .select('apr.*', 'p.id AS person_id', 'person_token');

             let activity_ids = new Set();

             for(let item of reviewsQry) {
                 activity_ids.add(item.activity_id);
             }

             let activitiesQry = await conn('activities')
                 .whereIn('id', Array.from(activity_ids))
                 .select('id', 'activity_token');

             let activityIdTokenMap = {};

             for(let activity of activitiesQry) {
                 activityIdTokenMap[activity.id] = activity.activity_token;
             }

             let organized = {};

             for(let item of reviewsQry) {
                 let activity_token = activityIdTokenMap[item.activity_id];
                 let person_token = item.person_token;

                 if(!organized[activity_token]) {
                     organized[activity_token] = {};
                 }

                 if(!organized[activity_token][person_token]) {
                     organized[activity_token][person_token] = {
                         ratings: {}
                     };
                 }

                 if(!item.review_id) {
                     organized[activity_token][person_token].no_show = item.no_show;
                 } else if(item.rating) {
                     let reviewData = reviewsLookup.byId[item.review_id];
                     organized[activity_token][person_token].ratings[reviewData.token] = item.rating;
                 }
             }

             resolve(organized);
        } catch(e) {
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
    getPersonReviews
};
