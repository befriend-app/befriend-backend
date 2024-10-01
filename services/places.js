const cacheService = require('../services/cache');
const dbService = require('../services/db');
const fsq = require('../.api/apis/fsq-developers');
const {getMetersFromMilesOrKm, timeNow, getDistanceMeters, normalizeDistance, getMilesOrKmFromMeters, useKM, cloneObj,
    getCoordBoundBox
} = require("./shared");

const dayjs = require('dayjs');
const {cache_key} = require("./genders");

module.exports = {
    refresh_data: 30, //days
    default: {
        radius: 1 //miles or km
    },
    fields: {
        core: `fsq_id,closed_bucket,distance,geocodes,location,name,timezone`, //categories,chains,link,related_places
        rich: `price,description,hours,hours_popular,rating,popularity,venue_reality_bucket` //verified,hours_popular,stats,menu,date_closed,photos,tips,tastes,features,store_id,
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
            let places_organized = [];
            let conn, category_geo_id, categories_key, search_radius_meters, searchBox;

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
                conn = await dbService.conn();
            } catch(e) {
                console.error(e);
            }

            //query db/cache for existing data
            try {
                //categories key is a string, sorted from lowest category_id to highest
                categories_key = cloneObj(category_ids).sort().join(',');
                search_radius_meters = getMetersFromMilesOrKm(radius, true);
                searchBox = getCoordBoundBox(location.lat, location.lon, radius);

                //todo
            } catch(e) {
                console.error(e);
            }

            try {
                //set fsq auth
                fsq.auth(process.env.FSQ_KEY);

                //query fsq api
                let data = await fsq.placeSearch({
                    ll: `${location.lat},${location.lon}`,
                    categories: category_ids.join(','),
                    radius: search_radius_meters,
                    fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                    limit: 50,
                    // query: 'movie theater',
                    // min_price: 1,
                    // max_price: 3
                });

                let places = data.data.results;

                //save data to db/cache

                //1. categories_geo
                try {
                    let expires = dayjs().add(module.exports.refresh_data, 'days').valueOf();

                    category_geo_id = await conn('categories_geo')
                        .insert({
                            categories_key: categories_key,
                            location_lat: location.lat,
                            location_lon: location.lon,
                            location_lat_1000: parseInt(Math.floor(location.lat * 1000)),
                            location_lon_1000: parseInt(Math.floor(location.lon * 1000)),
                            search_radius_meters: search_radius_meters,
                            location_lat_min: searchBox.minLat,
                            location_lon_min: searchBox.minLon,
                            location_lat_max: searchBox.maxLat,
                            location_lon_max: searchBox.maxLon,
                            location_lat_min_1000: searchBox.minLat1000,
                            location_lon_min_1000: searchBox.minLon1000,
                            location_lat_max_1000: searchBox.maxLat1000,
                            location_lon_max_1000: searchBox.maxLon1000,
                            expires: expires,
                            created: timeNow(),
                            updated: timeNow()
                        });

                    category_geo_id = category_geo_id[0];
                } catch(e) {
                    console.error(e);
                }

                for(let data of places) {
                    //2. places

                    let place;

                    try {
                        place = await module.exports.getPlaceFSQ(data.fsq_id);

                        if(place) {
                            //update
                            await module.exports.updatePlace(place.id, data);
                        } else {
                            //insert
                            place = await module.exports.addPlace(data);
                        }
                    } catch(e) {
                        console.error(e);
                    }

                    //3. categories_geo_places
                    try {
                        let check = await conn('categories_geo_places')
                            .where('category_geo_id', category_geo_id)
                            .where('place_id', place.id)
                            .first();

                        if(place && !check) {
                            await conn('categories_geo_places')
                                .insert({
                                    category_geo_id: category_geo_id,
                                    place_id: place.id,
                                    created: timeNow(),
                                    updated: timeNow()
                                });
                        }
                    } catch(e) {
                        console.error(e);
                    }
                }

                //organize return data
                try {
                    await module.exports.sortPlaces(places, search_radius_meters);

                    for(let place of places){
                        places_organized.push({
                            name: place.name,
                            geo: {
                                lat: place.geocodes.main.latitude,
                                lon: place.geocodes.main.longitude
                            },
                            distance: {
                                meters: place.distance,
                                miles_km: getMilesOrKmFromMeters(place.distance),
                                use_km: useKM()
                            },
                            location: place.location,
                            popularity: place.popularity,
                            rating: place.rating,
                            price: place.price,
                            real: place.venue_reality_bucket
                        });
                    }

                    resolve(places_organized);
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
    getPlaceFSQ: function (fsq_id) {
        return new Promise(async (resolve, reject) => {
            if(!fsq_id) {
                return reject("No id provided");
            }

            //try cache first
            let cache_key = `${cacheService.keys.place_fsq}:${fsq_id}`;

            try {
                let cache_data = await cacheService.get(cache_key, true);

                if(cache_data) {
                    return resolve(cache_data);
                }
            } catch(e) {
                console.error(e);
            }

            //db backup
            try {
                let conn = await dbService.conn();

                let qry = await conn('places')
                    .where('fsq_place_id', fsq_id)
                    .first();

                if(qry) {
                    await cacheService.setCache(cache_key, qry);
                }

                resolve(qry);
            } catch(e) {
                console.error(e);
                return reject();
            }
        });
    },
    updatePlace: function (place_id, data) {
        return new Promise(async (resolve, reject) => {
            let cache_key = `${cacheService.keys.place_fsq}:${data.fsq_id}`;

            let lat, lon, lat_1000, lon_1000, hours, hours_popular, address, address_2, locality, postcode, region;

            try {
                lat = data.geocodes.main.latitude;
                lon = data.geocodes.main.longitude;
                lat_1000 = parseInt(Math.floor(data.geocodes.main.latitude * 1000));
                lon_1000 = parseInt(Math.floor(data.geocodes.main.longitude * 1000));
            } catch(e) {
                console.error(e);
            }

            try {
                hours = JSON.stringify(data.hours.regular);
            } catch(e) {
                console.error(e);
            }

            try {
                hours_popular = JSON.stringify(data.hours_popular);
            } catch(e) {
                console.error(e);
            }

            try {
                 address = data.location.address;
                 address_2 = data.location.address_extended;
                 locality = data.location.locality;
                 postcode = data.location.postcode;
                 region = data.location.region;
            } catch(e) {
                console.error(e);
            }

            try {
                let conn = await dbService.conn();

                let updateData = {
                    name: data.name,
                    open_probability: data.closed_bucket,
                    location_lat: lat,
                    location_lon: lon,
                    location_lat_1000: lat_1000,
                    location_lon_1000: lon_1000,
                    hours: hours,
                    hours_popular: hours_popular,
                    location_address: address,
                    location_address_2: address_2,
                    location_locality: locality,
                    location_postcode: postcode,
                    location_region: region,
                    popularity: data.popularity,
                    price: data.price,
                    rating: data.rating,
                    reality: data.venue_reality_bucket,
                    timezone: data.timezone,
                    updated: timeNow()
                };

                await conn('places')
                    .where('id', place_id)
                    .update(updateData);

                //prev data
                let cache_data = await cacheService.get(cache_key, true);

                //update with new data
                for(let k in updateData) {
                    cache_data[k] = updateData[k];
                }

                await cacheService.setCache(cache_key, cache_data);
            } catch(e) {
                console.error(e);
                return reject(e);
            }

            resolve();
        });
    },
    addPlace: function (data) {
        return new Promise(async (resolve, reject) => {
            let cache_key = `${cacheService.keys.place_fsq}:${data.fsq_id}`;

            let lat, lon, lat_1000, lon_1000, hours, hours_popular, address, address_2, locality, postcode, region;

            try {
                lat = data.geocodes.main.latitude;
                lon = data.geocodes.main.longitude;
                lat_1000 = parseInt(Math.floor(data.geocodes.main.latitude * 1000));
                lon_1000 = parseInt(Math.floor(data.geocodes.main.longitude * 1000));
            } catch(e) {
                console.error(e);
            }

            try {
                hours = JSON.stringify(data.hours.regular);
            } catch(e) {
                console.error(e);
            }

            try {
                hours_popular = JSON.stringify(data.hours_popular);
            } catch(e) {
                console.error(e);
            }

            try {
                address = data.location.address;
                address_2 = data.location.address_extended;
                locality = data.location.locality;
                postcode = data.location.postcode;
                region = data.location.region;
            } catch(e) {
                console.error(e);
            }

            try {
                let conn = await dbService.conn();

                let insert_data = {
                    fsq_place_id: data.fsq_id,
                    name: data.name,
                    open_probability: data.closed_bucket,
                    location_lat: lat,
                    location_lon: lon,
                    location_lat_1000: lat_1000,
                    location_lon_1000: lon_1000,
                    hours: hours,
                    hours_popular: hours_popular,
                    location_address: address,
                    location_address_2: address_2,
                    location_locality: locality,
                    location_postcode: postcode,
                    location_region: region,
                    popularity: data.popularity,
                    price: data.price,
                    rating: data.rating,
                    reality: data.venue_reality_bucket,
                    timezone: data.timezone,
                    created: timeNow(),
                    updated: timeNow()
                };

                let id = await conn('places')
                    .insert(insert_data);

                insert_data.id = id[0];

                await cacheService.setCache(cache_key, insert_data);

                return resolve(insert_data);
            } catch(e) {
                console.error(e);
                return reject(e);
            }
        });
    }
}