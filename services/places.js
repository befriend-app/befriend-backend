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
    weights: {
        open_probability: {
            weight: .3,
            values: {
                VeryLikelyOpen: 10,
                LikelyOpen: 8,
                Unsure: 6,
                LikelyClosed: 4,
                VeryLikelyClosed: 2,
            }
        },
        distance: {
            weight: .7,
        }
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

                // TODO: remove later; just checking to make sure we aren't missing a closed bucket key
                for(let place of data.data.results) {
                    const { closed_bucket} = place;
    
                    if(!(closed_bucket in module.exports.weights.open_probability.values)) {
                        console.log("The following key was not found in dictionary", closed_bucket);
                    }
                }

                try {
                    places_sorted = module.exports.sortPlaces(data.data.results);

                    resolve(places_sorted);
                } catch(e) {
                    console.error(e);
                    reject(e);
                }                
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    sortPlaces: function(places) {
        function normalizeDistance(distance) {
            return 1 - Math.min(distance/10000, 1);
        }

        const weights = module.exports.weights;

        // TODO: implement other weights in score equation: popularity, rating, venue reality bucket
        return places.sort((a, b) => {

            let normalize_open_a = (weights.open_probability.values[a.closed_bucket] / 10);
            let normalize_open_b = (weights.open_probability.values[b.closed_bucket] / 10);
            
            const score_a = (normalizeDistance(a.distance) * weights.distance.weight) + (normalize_open_a * weights.open_probability.weight);
            const score_b = (normalizeDistance(b.distance) * weights.distance.weight) + (normalize_open_b * weights.open_probability.weight);

            return score_b - score_a;
        });
    },
}