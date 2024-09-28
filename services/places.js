const cacheService = require('../services/cache');
const dbService = require('../services/db');
const fsq = require('../.api/apis/fsq-developers');
const {getMetersFromMiles} = require("./shared");


module.exports = {
    default: {
        radius: 5
    },
    fields: {
        core: `fsq_id,categories,chains,closed_bucket,distance,geocodes,link,location,name,related_places,timezone`,
        rich: `price,description,verified,hours,hours_popular,rating,stats,popularity,menu,date_closed,photos,tips,tastes,features,store_id,venue_reality_bucket`
    },
    getCategoriesPlaces: function (category_ids, location, radius_miles) {
        return new Promise(async (resolve, reject) => {
            if(!radius_miles){
                radius_miles = module.exports.default.radius;
            }

            if(!location || !(location.lat && location.lon)) {
                return reject("Missing location")
            }

            if(!category_ids) {
                return reject("Categories required")
            }

            if(!Array.isArray(category_ids)) {
                category_ids = [category_ids];
            }

            try {
                fsq.auth(process.env.FSQ_KEY);

                let data = await fsq.placeSearch({
                    // query: 'movie theater',
                    ll: `${location.lat},${location.lon}`,
                    categories: category_ids.join(','),
                    radius: getMetersFromMiles(radius_miles, true),
                    fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                    limit: 50,
                    // min_price: 1,
                    // max_price: 3
                });

                resolve(data.data.results);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
}