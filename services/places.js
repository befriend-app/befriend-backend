const cacheService = require("../services/cache");
const dbService = require("../services/db");
const fsq = require("../.api/apis/fsq-developers");
const {
    getMetersFromMilesOrKm,
    timeNow,
    getDistanceMeters,
    normalizeDistance,
    getMilesOrKmFromMeters,
    useKM,
    cloneObj,
    getCoordsBoundBox,
    range,
    getTimeZoneFromCoords,
} = require("./shared");

const dayjs = require("dayjs");

module.exports = {
    refresh_data: 30, //days
    default: {
        radius: 2, //miles or km
    },
    fields: {
        core: `fsq_id,closed_bucket,distance,geocodes,location,name,timezone`, //categories,chains,link,related_places
        rich: `price,description,hours,hours_popular,rating,popularity,venue_reality_bucket,photos`, //verified,stats,menu,date_closed,photos,tips,tastes,features,store_id,
    },
    weights: {
        distance: {
            weight: 0.2,
        },
        popularity: {
            weight: 0.15,
        },
        rating: {
            weight: 0.15,
        },
        business_open: {
            weight: 0.2,
            values: {
                VeryLikelyOpen: 1,
                LikelyOpen: 0.8,
                Unsure: 0.6,
                LikelyClosed: 0.3,
                VeryLikelyClosed: 0,
            },
        },
        venue_reality: {
            weight: 0.3,
            values: {
                VeryHigh: 1,
                High: 0.8,
                Medium: 0.5,
                Low: 0.2,
            },
        },
    },
    getCategoriesPlaces: function (category_ids, location, radius) {
        return new Promise(async (resolve, reject) => {
            let places_organized = [];
            let conn, category_geo_id, categories_key, search_radius_meters, searchBox;

            if (!radius) {
                radius = module.exports.default.radius;
            }

            if (!location || !(location.lat && location.lon)) {
                return reject("Missing location");
            }

            if (!category_ids) {
                return reject("Categories required");
            }

            if (!Array.isArray(category_ids)) {
                category_ids = [category_ids];
            }

            try {
                conn = await dbService.conn();
            } catch (e) {
                console.error(e);
            }

            let categories_geo = [];

            //query db/cache for existing data
            try {
                let testBox = getCoordsBoundBox(location.lat, location.lon, 0.71);
                // location.lat = testBox.maxLat;
                // location.lon = testBox.maxLon;

                //categories key is a string, sorted from lowest category_id to highest
                categories_key = cloneObj(category_ids).sort().join(",");
                search_radius_meters = getMetersFromMilesOrKm(radius, true);
                searchBox = getCoordsBoundBox(location.lat, location.lon, radius);

                //todo
                let lats = range(searchBox.minLat1000, searchBox.maxLat1000);
                let lons = range(searchBox.minLon1000, searchBox.maxLon1000);

                try {
                    // categories_geo = await conn('categories_geo')
                    //     .whereIn('location_lat_1000', lats)
                    //     .whereIn('location_lon_1000', lons)
                    //     // .whereBetween('location_lat', [box.minLat, box.maxLon])
                    //     // .whereBetween('location_lon', [searchBox.minLon, searchBox.maxLon])
                    //     .whereRaw('(ST_Distance_Sphere(point(location_lon, location_lat), point(?,?))) <= ?', [
                    //         location.lon,
                    //         location.lat,
                    //         getMetersFromMilesOrKm(radius)
                    //     ]);
                } catch (e) {
                    console.log(e);
                }
            } catch (e) {
                console.error(e);
            }

            try {
                //set fsq auth
                fsq.auth(process.env.FSQ_KEY);

                //query fsq api
                let data = await fsq.placeSearch({
                    ll: `${location.lat},${location.lon}`,
                    categories: category_ids.join(","),
                    radius: search_radius_meters,
                    fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                    limit: 50,
                    // query: 'movie theater',
                    // min_price: 1,
                    // max_price: 3
                });

                let places = data.data.results;

                //update rating from scale of 10 to 5
                for (let place of places) {
                    if (place.rating) {
                        place.rating = place.rating / 2;
                    }
                }

                //save data to db/cache

                //1. categories_geo
                try {
                    let expires = dayjs().add(module.exports.refresh_data, "days").valueOf();

                    category_geo_id = await conn("categories_geo").insert({
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
                        updated: timeNow(),
                    });

                    category_geo_id = category_geo_id[0];
                } catch (e) {
                    console.error(e);
                }

                //todo - refactor for batch get/insert
                for (let data of places) {
                    //2. places
                    let place;

                    try {
                        place = await module.exports.getPlaceFSQ(data.fsq_id);

                        if (place) {
                            //update
                            await module.exports.addOrUpdatePlace(data, place.id);
                        } else {
                            //insert
                            place = await module.exports.addOrUpdatePlace(data);
                        }
                    } catch (e) {
                        console.error(e);
                        continue;
                    }

                    //3. categories_geo_places
                    try {
                        let check = await conn("categories_geo_places")
                            .where("category_geo_id", category_geo_id)
                            .where("place_id", place.id)
                            .first();

                        if (place && !check) {
                            await conn("categories_geo_places").insert({
                                category_geo_id: category_geo_id,
                                place_id: place.id,
                                created: timeNow(),
                                updated: timeNow(),
                            });
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    //set distance of device/custom location from place
                    place.distance = {
                        use_km: useKM(),
                        meters: getDistanceMeters(location, {
                            lat: place.location_lat,
                            lon: place.location_lon,
                        }),
                    };

                    place.distance.miles_km = getMilesOrKmFromMeters(place.distance.meters);

                    places_organized.push(place);
                }

                //organize return data
                try {
                    await module.exports.sortPlaces(places_organized, search_radius_meters);

                    resolve(places_organized);
                } catch (e) {
                    console.error(e);
                    reject(e);
                }
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    sortPlaces: function (places, radius_meters) {
        function normalizeRating(value) {
            return value / 5;
        }

        return new Promise(async (resolve, reject) => {
            if (places && !places.length) {
                return resolve(places);
            }

            if (!places || typeof radius_meters === "undefined") {
                return reject("Invalid sort places params");
            }

            let weights = module.exports.weights;

            try {
                places.sort((a, b) => {
                    //normalize all to range from 0-1

                    let score = 0;

                    //shorter distance first
                    let aDistance = normalizeDistance(a.distance.meters, radius_meters);
                    let bDistance = normalizeDistance(b.distance.meters, radius_meters);
                    score += (bDistance - aDistance) * weights.distance.weight;

                    //higher popularity first
                    score += (a.popularity - b.popularity) * weights.popularity.weight;

                    //higher rating first
                    score += (normalizeRating(a.rating) - normalizeRating(b.rating)) * weights.rating.weight;

                    //in business
                    let aOpen = weights.business_open.values[a.business_open];
                    let bOpen = weights.business_open.values[b.business_open];
                    score += (aOpen - bOpen) * weights.business_open.weight;

                    //real
                    let aReality = weights.venue_reality.values[a.reality];
                    let bReality = weights.venue_reality.values[b.reality];
                    score += (aReality - bReality) * weights.venue_reality.weight;

                    return score;
                });

                resolve();
            } catch (e) {
                console.error(e);
                reject(e);
            }
        });
    },
    getPlaceFSQ: function (fsq_id) {
        return new Promise(async (resolve, reject) => {
            if (!fsq_id) {
                return reject("No id provided");
            }

            //try cache first
            let cache_key = `${cacheService.keys.place_fsq}:${fsq_id}`;

            try {
                let cache_data = await cacheService.get(cache_key, true);

                if (cache_data) {
                    return resolve(cache_data);
                }
            } catch (e) {
                console.error(e);
            }

            //db backup
            try {
                let conn = await dbService.conn();

                let qry = await conn("places").where("fsq_place_id", fsq_id).first();

                if (qry) {
                    //parse json
                    if (qry.hours) {
                        qry.hours = JSON.parse(qry.hours);
                    }

                    if (qry.hours_popular) {
                        qry.hours_popular = JSON.parse(qry.hours_popular);
                    }

                    if (qry.photos) {
                        qry.photos = JSON.parse(qry.photos);
                    }

                    await cacheService.setCache(cache_key, qry);
                }

                resolve(qry);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
    getBatchPlacesFSQ: function (fsq_ids) {
        return new Promise(async (resolve, reject) => {
            if (!fsq_ids || !fsq_ids.length) {
                return reject("No ids provided");
            }

            let fsq_dict = {};

            let cache_miss_ids = [];

            let multi = cacheService.conn.multi();

            for (let fsq_id of fsq_ids) {
                let cache_key = `${cacheService.keys.place_fsq}${fsq_id}`;

                multi.get(cache_key);
            }

            //try cache first
            try {
                let cache_data = await cacheService.execRedisMulti(multi);

                for (let i = 0; i < cache_data.length; i++) {
                    let data = cache_data[i];
                    let fsq_id = fsq_ids[i];

                    if (data) {
                        try {
                            data = JSON.parse(data);
                            fsq_dict[fsq_id] = data;
                        } catch (e) {
                            console.error(e);
                        }
                    } else {
                        // use in db query
                        cache_miss_ids.push(fsq_id);
                    }
                }
            } catch (e) {
                console.error(e);
            }

            //db backup
            try {
                let conn = await dbService.conn();

                let places = await conn("places").whereIn("fsq_place_id", cache_miss_ids);

                for (let place of places) {
                    let cache_key = `${cacheService.keys.place_fsq}:${place.fsq_place_id}`;

                    //parse json
                    if (place.hours) {
                        place.hours = JSON.parse(place.hours);
                    }

                    if (place.hours_popular) {
                        place.hours_popular = JSON.parse(place.hours_popular);
                    }

                    if (place.photos) {
                        place.photos = JSON.parse(place.photos);
                    }

                    fsq_dict[place.fsq_place_id] = place;

                    await cacheService.setCache(cache_key, place);
                }
            } catch (e) {
                console.error(e);
                return reject();
            }

            resolve(fsq_dict);
        });
    },
    addOrUpdatePlace: function (data, place_id = null) {
        return new Promise(async (resolve, reject) => {
            let cache_key = `${cacheService.keys.place_fsq}:${data.fsq_id}`;

            let lat,
                lon,
                lat_1000,
                lon_1000,
                hours,
                hours_popular,
                address,
                address_2,
                locality,
                postcode,
                region,
                photo_urls = [];

            try {
                lat = data.geocodes.main.latitude;
                lon = data.geocodes.main.longitude;
                lat_1000 = parseInt(Math.floor(data.geocodes.main.latitude * 1000));
                lon_1000 = parseInt(Math.floor(data.geocodes.main.longitude * 1000));
            } catch (e) {
                console.error(e);
            }

            try {
                for (let photo of data.photos) {
                    let photo_url = {
                        prefix: photo.prefix,
                        suffix: photo.suffix,
                    };

                    photo_urls.push(photo_url);
                }

                if (photo_urls.length) {
                    photo_urls = JSON.stringify(photo_urls);
                } else {
                    photo_urls = null;
                }
            } catch (e) {
                console.error(e);
            }

            //stringify for db
            try {
                hours = JSON.stringify(data.hours.regular);
            } catch (e) {
                console.error(e);
            }

            try {
                hours_popular = JSON.stringify(data.hours_popular);
            } catch (e) {
                console.error(e);
            }

            try {
                address = data.location.address;
                address_2 = data.location.address_extended;
                locality = data.location.locality;
                postcode = data.location.postcode;
                region = data.location.region;
            } catch (e) {
                console.error(e);
            }

            try {
                let conn = await dbService.conn();

                let timezone = data.timezone;

                if (!timezone) {
                    timezone = getTimeZoneFromCoords(lat, lon);
                }

                if (!timezone) {
                    return reject("No time zone");
                }

                let db_data = {
                    name: data.name,
                    business_open: data.closed_bucket,
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
                    photos: photo_urls,
                    popularity: data.popularity,
                    price: data.price,
                    rating: data.rating,
                    reality: data.venue_reality_bucket,
                    timezone: timezone,
                    updated: timeNow(),
                };

                if (place_id) {
                    await conn("places").where("id", place_id).update(db_data);

                    //prev data
                    let cache_data = await cacheService.get(cache_key, true);

                    //include all properties for re-saving to cache
                    for (let k in cache_data) {
                        //only add properties not set above
                        if (!(k in db_data)) {
                            db_data[k] = cache_data[k];
                        }
                    }

                    db_data.id = place_id;
                } else {
                    db_data.fsq_place_id = data.fsq_id;
                    db_data.created = timeNow();

                    let id = await conn("places").insert(db_data);

                    db_data.id = id[0];
                }

                //parse back
                if (hours) {
                    db_data.hours = JSON.parse(hours);
                }

                if (hours_popular) {
                    db_data.hours_popular = JSON.parse(hours_popular);
                }

                await cacheService.setCache(cache_key, db_data);

                return resolve(db_data);
            } catch (e) {
                console.error(e);
                return reject(e);
            }
        });
    },
    placesAutoComplete: function (session_token, search, lat, lon, friends) {
        return new Promise(async (resolve, reject) => {
            let conn;
            let search_type = "place";

            if (friends.type.is_existing) {
                search_type = "place,address";
            }

            try {
                conn = await dbService.conn();
            } catch (e) {
                console.error(e);
            }

            try {
                fsq.auth(process.env.FSQ_KEY);

                let data = await fsq.autocomplete({
                    session_token: session_token,
                    ll: `${lat},${lon}`,
                    types: search_type,
                    query: search,
                    radius: 50000,
                    limit: 10,
                });

                let results = [];

                // batch logic
                let batch_dict = {};
                let fsq_ids = [];
                let fsq_dict = {};

                for (let result of data.data.results) {
                    if (result.place) {
                        fsq_ids.push(result.place.fsq_id);
                        fsq_dict[result.place.fsq_id] = result.place;
                    }
                }

                try {
                    batch_dict = await module.exports.getBatchPlacesFSQ(fsq_ids);

                    let batch_insert = [];

                    for (let fsq_id of fsq_ids) {
                        if (!(fsq_id in batch_dict)) {
                            let data = fsq_dict[fsq_id];

                            let lat = data.geocodes.main.latitude;
                            let lon = data.geocodes.main.longitude;
                            let lat_1000 = parseInt(Math.floor(lat * 1000));
                            let lon_1000 = parseInt(Math.floor(lon * 1000));

                            let insert_data = {
                                fsq_place_id: fsq_id,
                                name: data.name,
                                location_address: data.location.address,
                                location_address_2: data.location.address_extended,
                                location_locality: data.location.locality,
                                location_postcode: data.location.postcode,
                                location_region: data.location.region,
                                location_lat: lat,
                                location_lat_1000: lat_1000,
                                location_lon: lon,
                                location_lon_1000: lon_1000,
                                timezone: getTimeZoneFromCoords(lat, lon),
                                created: timeNow(),
                                updated: timeNow(),
                            };

                            batch_insert.push(insert_data);

                            batch_dict[fsq_id] = insert_data;
                        }
                    }

                    if (batch_insert.length) {
                        //db
                        try {
                            await dbService.batchInsert(conn, "places", batch_insert, true);
                        } catch (e) {
                            console.error(e);
                        }

                        //cache
                        try {
                            let multi = cacheService.conn.multi();

                            for (let item of batch_insert) {
                                let cache_key = cacheService.keys.place_fsq + item.fsq_place_id;

                                multi.set(cache_key, JSON.stringify(item));
                            }

                            await cacheService.execRedisMulti(multi);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }

                // organize data
                for (let result of data.data.results) {
                    let place_data = {};

                    if (result.type === "place") {
                        place_data = batch_dict[result.place.fsq_id];
                        place_data.type = "place";

                        // set distance in mi/km
                        if (result.place.geocodes && result.place.geocodes.main) {
                            let geo = result.place.geocodes.main;

                            place_data.distance = {
                                use_km: useKM(),
                                meters: getDistanceMeters(
                                    {
                                        lat,
                                        lon,
                                    },
                                    {
                                        lat: geo.latitude,
                                        lon: geo.longitude,
                                    },
                                ),
                            };

                            place_data.distance.miles_km = getMilesOrKmFromMeters(place_data.distance.meters);
                        }
                    } else if (result.type === "address") {
                        place_data.type = "address";
                        place_data.fsq_address_id = result.address.address_id;
                        place_data.location_address = resolve.text.primary;

                        try {
                            let secondary_split = result.text.secondary.split(" ");

                            place_data.location_locality = secondary_split[0];
                            place_data.location_region = secondary_split[1];
                            place_data.location_postcode = secondary_split[2];
                        } catch (e) {
                            console.error(e);
                        }
                    }

                    results.push(place_data);
                }

                return resolve(results);
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
};
