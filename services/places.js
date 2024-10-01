const cacheService = require('../services/cache');
const dbService = require('../services/db');
const fsq = require('../.api/apis/fsq-developers');
const {getMetersFromMilesOrKm, timeNow, getDistanceMeters, normalizeDistance} = require("./shared");

module.exports = {
    default: {
        radius: 1 //miles or km
    },
    fields: {
        core: `fsq_id,closed_bucket,distance,geocodes,location,name,timezone`, //categories,chains,link,related_places
        rich: `price,description,hours,rating,popularity,venue_reality_bucket` //verified,hours_popular,stats,menu,date_closed,photos,tips,tastes,features,store_id,
    },
    weights: {
        distance: {
            weight: .4,
        },
        popularity: {
            weight: .15,
        },
        rating: {
            weight: .15,
        },
        open_probability: {
            weight: .2,
            values: {
                VeryLikelyOpen: 1,
                LikelyOpen: .8,
                Unsure: .6,
                LikelyClosed: .3,
                VeryLikelyClosed: 0,
            }
        },
        venue_reality: {
            weight: .2,
            values: {
                VeryHigh: 1,
                High: .9,
                Medium: .7,
                Low: .3
            }
        },
    },
    getCategoriesPlaces: function (category_ids, location, radius) {
        return new Promise(async (resolve, reject) => {
            if(!radius){
                radius = module.exports.default.radius;
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
                //set fsq auth
                fsq.auth(process.env.FSQ_KEY);

                let radius_meters = getMetersFromMilesOrKm(radius, true);

                let data = await fsq.placeSearch({
                    ll: `${location.lat},${location.lon}`,
                    categories: category_ids.join(','),
                    radius: radius_meters,
                    fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                    limit: 20,
                    // query: 'movie theater',
                    // min_price: 1,
                    // max_price: 3
                });

                try {
                    let places_sorted = await module.exports.sortPlaces(data.data.results, radius_meters);

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
    sortPlaces: function(places, radius_meters) {
        return new Promise(async (resolve, reject) => {
            if(!places || !places.length || typeof radius_meters === 'undefined') {
                return reject("Invalid sort places params");
            }

            let weights = module.exports.weights;

            try {
                places.sort((a, b) => {
                    let score = 0;

                    //shorter distance first
                    let aDistance = normalizeDistance(a.distance, radius_meters);
                    let bDistance = normalizeDistance(b.distance, radius_meters);
                    score += (bDistance - aDistance) * weights.distance.weight;

                    //higher popularity first
                    score += (a.popularity - b.popularity) * weights.popularity.weight;

                    //higher rating first
                    score += (a.rating - b.rating) * weights.rating.weight;

                    //in business
                    let aOpen = weights.open_probability.values[a.closed_bucket];
                    let bOpen = weights.open_probability.values[b.closed_bucket];
                    score += (aOpen - bOpen) * weights.open_probability.weight;

                    //reality
                    let aReality = weights.venue_reality.values[a.venue_reality_bucket];
                    let bReality = weights.venue_reality.values[b.venue_reality_bucket];
                    score += (aReality - bReality) * weights.venue_reality.weight;

                    return score;
                });

                resolve();
            } catch(e) {
                console.error(e);
                reject(e);
            }
        });
    },
}