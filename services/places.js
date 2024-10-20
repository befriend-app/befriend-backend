const cacheService = require("../services/cache");
const dbService = require("../services/db");
const fsq = require("../.api/apis/fsq-developers");
const fsqService = require("../services/fsq");

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
    getDistanceMilesOrKM,
    getCoordsFromPointDistance,
} = require("./shared");

const dayjs = require("dayjs");
const { batchInsert, batchUpdate } = require("./db");

module.exports = {
    refresh_data: 30, //days
    cache_distance: 0.5, //mi/km
    default: {
        radius: 2, //mi/km
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
    cols: {
        json: ["hours", "hours_popular", "photos"], //these cols are stringified in the db
    },
    getCategoriesPlaces: function (category_ids, location, radius) {
        let conn, categories_key, search_radius_meters, map_location, device_location, searchBox;

        if (!radius) {
            radius = module.exports.default.radius;
        }

        function searchCategoryPlaces() {
            return new Promise(async (resolve, reject) => {
                let category_geo_id;

                // batching
                let fsq_ids = [];
                let fsq_dict = {};

                let batch_geo_place_insert = [];

                try {
                    let places = await fsqService.getPlacesByCategory(
                        map_location.lat,
                        map_location.lon,
                        radius,
                        category_ids.join(","),
                    );

                    for (let place of places) {
                        //update rating from scale of 10 to 5
                        if (place.rating) {
                            place.rating = place.rating / 2;
                        }

                        //for batching
                        fsq_ids.push(place.fsq_id);
                        fsq_dict[place.fsq_id] = place;
                    }

                    //save data to db/cache

                    //1. categories_geo
                    try {
                        let expires = dayjs().add(module.exports.refresh_data, "days").valueOf();

                        category_geo_id = await conn("categories_geo").insert({
                            categories_key: categories_key,
                            location_lat: map_location.lat,
                            location_lon: map_location.lon,
                            location_lat_1000: parseInt(Math.floor(map_location.lat * 1000)),
                            location_lon_1000: parseInt(Math.floor(map_location.lon * 1000)),
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

                    //no results cached above - return empty array
                    if (!places.length) {
                        return resolve([]);
                    }

                    let batch_dict = await module.exports.processFSQPlaces(fsq_ids, fsq_dict);

                    let batch_places = Object.values(batch_dict);

                    for (let place of batch_places) {
                        //3. categories_geo_places
                        batch_geo_place_insert.push({
                            category_geo_id: category_geo_id,
                            place_id: place.id,
                            created: timeNow(),
                            updated: timeNow(),
                        });
                    }

                    try {
                        await batchInsert(conn, "categories_geo_places", batch_geo_place_insert);
                    } catch (e) {
                        console.error(e);
                    }

                    resolve(batch_places);
                } catch (e) {
                    console.error(e);
                    return reject();
                }
            });
        }

        return new Promise(async (resolve, reject) => {
            let places_organized = [];

            if (!location || !location.map || !(location.map.lat && location.map.lon)) {
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

            map_location = location.map;
            device_location = location.device;

            let categories_geo = [];

            //query db/cache for existing data
            try {
                let search_lat = map_location.lat;
                let search_lon = map_location.lon;

                //categories key is a string, sorted from lowest to highest category_id
                categories_key = cloneObj(category_ids).sort().join(",");
                search_radius_meters = getMetersFromMilesOrKm(radius, true);
                searchBox = getCoordsBoundBox(search_lat, search_lon, radius);

                let lats = range(searchBox.minLat1000, searchBox.maxLat1000);
                let lons = range(searchBox.minLon1000, searchBox.maxLon1000);

                try {
                    categories_geo = await conn("categories_geo")
                        .whereIn("location_lat_1000", lats)
                        .whereIn("location_lon_1000", lons)
                        .where("categories_key", categories_key)
                        .whereRaw("(ST_Distance_Sphere(point(location_lon, location_lat), point(?,?))) <= ?", [
                            search_lon,
                            search_lat,
                            getMetersFromMilesOrKm(module.exports.cache_distance),
                        ]);
                } catch (e) {
                    console.log(e);
                }
            } catch (e) {
                console.error(e);
            }

            //use cached data
            if (categories_geo.length) {
                places_organized = await module.exports.getCachedCategoryPlaces(categories_geo);
            } else {
                places_organized = await searchCategoryPlaces();
            }

            if (!places_organized.length) {
                return resolve([]);
            }

            //set distance of device/map/custom location from place
            let from_location = device_location || map_location;

            for (let place of places_organized) {
                place.distance = {
                    use_km: useKM(),
                    meters: getDistanceMeters(from_location, {
                        lat: place.location_lat,
                        lon: place.location_lon,
                    }),
                };

                place.distance.miles_km = getMilesOrKmFromMeters(place.distance.meters);
            }

            try {
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
    getCachedCategoryPlaces: function (categories_geo) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();

                let ids = categories_geo.map((x) => x.id);

                let places_qry = await conn("categories_geo_places AS cgp")
                    .join("places AS p", "p.id", "=", "cgp.place_id")
                    .whereIn("category_geo_id", ids)
                    .select("fsq_place_id")
                    .groupBy("place_id");

                let fsq_place_ids = places_qry.map((x) => x.fsq_place_id);

                let places = await module.exports.getBatchPlacesFSQ(fsq_place_ids);

                return resolve(Object.values(places));
            } catch (e) {
                console.error(e);
                return reject();
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
            let cache_key = `${cacheService.keys.place_fsq}${fsq_id}`;

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
                    //parse json for stringified cols
                    for (let col of module.exports.cols.json) {
                        if (qry[col]) {
                            qry[col] = JSON.parse(qry[col]);
                        }
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
    addOrUpdatePlace: function (data, place_id = null) {
        return new Promise(async (resolve, reject) => {
            let cache_key = `${cacheService.keys.place_fsq}${data.fsq_id}`;

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
    placesAutoComplete: function (session_token, search, location, friends) {
        return new Promise(async (resolve, reject) => {
            // batching
            let fsq_ids = [];
            let fsq_dict = {};

            let search_type = "place";

            if (friends.type.is_existing) {
                search_type = "place,address";
            }

            let lat = location.map.lat;
            let lon = location.map.lon;

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

                if (!data.data.results.length) {
                    return resolve([]);
                }

                let results = [];

                for (let result of data.data.results) {
                    if (result.place) {
                        fsq_ids.push(result.place.fsq_id);
                        fsq_dict[result.place.fsq_id] = result.place;
                    }
                }

                let batch_dict = await module.exports.processFSQPlaces(fsq_ids, fsq_dict);

                // organize data
                for (let result of data.data.results) {
                    let place_data = {};

                    if (result.type === "place") {
                        place_data = batch_dict[result.place.fsq_id];
                        place_data.type = "place";

                        // set distance in mi/km
                        if (result.place.geocodes && result.place.geocodes.main) {
                            let geo = result.place.geocodes.main;

                            let from_lat = lat;
                            let from_lon = lon;

                            if (location.device && location.device.lat && location.device.lon) {
                                from_lat = location.device.lat;
                                from_lon = location.device.lon;
                            }

                            place_data.distance = {
                                use_km: useKM(),
                                meters: getDistanceMeters(
                                    {
                                        lat: from_lat,
                                        lon: from_lon,
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
                        place_data.location_address = result.text.primary;

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

                            for (let k in data) {
                                if (data[k] === "null") {
                                    data[k] = null;
                                }
                            }
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

                if (cache_miss_ids.length) {
                    let places = await conn("places").whereIn("fsq_place_id", cache_miss_ids);

                    for (let place of places) {
                        let cache_key = `${cacheService.keys.place_fsq}${place.fsq_place_id}`;

                        fsq_dict[place.fsq_place_id] = place;

                        await cacheService.setCache(cache_key, place);
                    }
                }
            } catch (e) {
                console.error(e);
                return reject();
            }

            resolve(fsq_dict);
        });
    },
    placeHasRichData: function (place) {
        let rich_keys = fsqService.fields.rich.split(",");

        for (let key of rich_keys) {
            if (key in place) {
                return true;
            }
        }

        return false;
    },
    processFSQPlaces: function (fsq_ids, fsq_dict) {
        return new Promise(async (resolve, reject) => {
            if (!fsq_ids || !fsq_ids.length) {
                return resolve({});
            }

            let batch_dict = {};
            let batch_insert = [];
            let batch_update = [];

            try {
                let conn = await dbService.conn();

                batch_dict = await module.exports.getBatchPlacesFSQ(fsq_ids);

                for (let fsq_id of fsq_ids) {
                    let lat,
                        lon,
                        lat_1000,
                        lon_1000,
                        hours,
                        hours_popular,
                        address,
                        address_2,
                        country,
                        locality,
                        postcode,
                        region,
                        timezone,
                        photo_urls = [];

                    let data = fsq_dict[fsq_id];

                    try {
                        address = data.location.address;
                        address_2 = data.location.address_extended || null;
                        locality = data.location.locality || null;
                        postcode = data.location.postcode || null;
                        region = data.location.region || null;
                        country = data.location.country || null;

                        lat = data.geocodes.main.latitude;
                        lon = data.geocodes.main.longitude;
                        lat_1000 = parseInt(Math.floor(lat * 1000));
                        lon_1000 = parseInt(Math.floor(lon * 1000));

                        timezone = data.timezone;

                        if (!timezone) {
                            timezone = getTimeZoneFromCoords(lat, lon);
                        }

                        try {
                            hours = JSON.stringify(data.hours.regular) || null;
                        } catch (e) {
                            hours = null;
                        }

                        try {
                            hours_popular = JSON.stringify(data.hours_popular) || null;
                        } catch (e) {
                            hours_popular = null;
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
                            photo_urls = null;
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    let place_data = {
                        fsq_place_id: fsq_id,
                        name: data.name,
                        business_open: data.closed_bucket,
                        hours: hours,
                        hours_popular: hours_popular,
                        location_address: address,
                        location_address_2: address_2,
                        location_locality: locality,
                        location_postcode: postcode,
                        location_region: region,
                        location_country: country,
                        location_lat: lat,
                        location_lat_1000: lat_1000,
                        location_lon: lon,
                        location_lon_1000: lon_1000,
                        photos: photo_urls,
                        popularity: data.popularity || null,
                        price: data.price || null,
                        rating: data.rating || null,
                        reality: data.venue_reality_bucket || null,
                        timezone: timezone,
                    };

                    if (!(fsq_id in batch_dict)) {
                        place_data.created = timeNow();
                        place_data.updated = timeNow();

                        batch_insert.push(place_data);

                        batch_dict[fsq_id] = place_data;
                    } else {
                        //possibly update if data added from autocomplete search first

                        if (module.exports.placeHasRichData(data)) {
                            let db_data = batch_dict[fsq_id];

                            //stringify db_data
                            for (let k in db_data) {
                                if (typeof db_data[k] === "object" && db_data[k] !== null) {
                                    db_data[k] = JSON.stringify(db_data[k]);
                                }
                            }

                            let do_update = false;

                            for (let k in place_data) {
                                let v = place_data[k];

                                if (v || db_data[k]) {
                                    if (db_data[k] !== v) {
                                        do_update = true;
                                        break;
                                    }
                                }
                            }

                            if (do_update) {
                                place_data.id = db_data.id;
                                place_data.created = db_data.created;
                                place_data.updated = timeNow();

                                batch_dict[fsq_id] = place_data;

                                batch_update.push(place_data);
                            }
                        }
                    }
                }

                //db
                if (batch_insert.length) {
                    try {
                        await batchInsert(conn, "places", batch_insert, true);
                    } catch (e) {
                        console.error(e);
                    }
                }

                if (batch_update.length) {
                    try {
                        await batchUpdate(conn, "places", batch_update);
                    } catch (e) {
                        console.error(e);
                    }
                }

                //set stringified data back to object
                for (let fsq_id in batch_dict) {
                    let data = batch_dict[fsq_id];

                    for (let col of module.exports.cols.json) {
                        if (typeof data[col] === "string") {
                            try {
                                data[col] = JSON.parse(data[col]);
                            } catch (e) {}
                        }
                    }
                }

                //cache
                try {
                    if (batch_insert.length || batch_update.length) {
                        let multi = cacheService.conn.multi();

                        for (let item of batch_insert.concat(batch_update)) {
                            let cache_key = cacheService.keys.place_fsq + item.fsq_place_id;
                            multi.set(cache_key, JSON.stringify(item));
                        }

                        await cacheService.execRedisMulti(multi);
                    }
                } catch (e) {
                    console.error(e);
                }
            } catch (e) {
                console.error(e);
            }

            resolve(batch_dict);
        });
    },
    getPlacesForCity: function (city_id) {
        return new Promise(async (resolve, reject) => {
            try {
                //loop through city by ever decreasing distances
                let distance_steps = [
                    //miles/km
                    15, 10, 5, 3, 1,
                ];

                let conn = await dbService.conn();

                let city = await conn("open_cities").where("id", city_id).first();

                if (!city) {
                    return reject();
                }

                // get unique list of categories
                let venue_categories = await conn("activity_type_venues AS atv")
                    .join("venues_categories AS vc", "vc.id", "=", "atv.venue_category_id")
                    .groupBy("venue_category_id")
                    .select("venue_category_id AS category_id", "fsq_id", "category_name");

                //calc distance of box
                let top_left = {
                    lat: city.bbox_lat_max,
                    lon: city.bbox_lon_min,
                };

                let top_right = {
                    lat: city.bbox_lat_max,
                    lon: city.bbox_lon_max,
                };

                let bottom_left = {
                    lat: city.bbox_lat_min,
                    lon: city.bbox_lon_min,
                };

                let lon_distance = getDistanceMilesOrKM(top_left, top_right);
                let lat_distance = getDistanceMilesOrKM(top_left, bottom_left);

                //starting point of coords for city
                let starting_coords = top_left;

                //stores places
                let category_distance_dict = {};

                let i = 0;

                for (let category of venue_categories) {
                    console.log({
                        category_name: category.category_name,
                    });

                    //initiate category
                    if (!(category.category_id in category_distance_dict)) {
                        category_distance_dict[category.category_id] = {
                            places: {},
                        };
                    }

                    for (let distance_step of distance_steps) {
                        //default to break loop
                        let break_distance_step = true;

                        console.log({
                            distance_step,
                        });

                        //initiate places for distance of category
                        if (!(distance_step in category_distance_dict[category.category_id])) {
                            category_distance_dict[category.category_id][distance_step] = {};
                        }

                        //latitude loop
                        for (let lat_mkm = 0; lat_mkm < lat_distance; lat_mkm += distance_step) {
                            let new_coords_lat = getCoordsFromPointDistance(
                                starting_coords.lat,
                                starting_coords.lon,
                                lat_mkm, //search with new latitude from this point
                                "south",
                            );

                            //longitude loop
                            //search with new longitude from this point
                            for (let lon_mkm = 0; lon_mkm < lon_distance; lon_mkm += distance_step) {
                                let new_coords = getCoordsFromPointDistance(
                                    new_coords_lat.lat, //from above
                                    starting_coords.lon,
                                    lon_mkm, //search with new longitude from this point
                                    "east",
                                );

                                //calculate number of loops
                                i++;

                                try {
                                    //get places
                                    let places = await fsqService.getPlacesByCategory(
                                        new_coords.lat,
                                        new_coords.lon,
                                        distance_step,
                                        category.fsq_id.toString(),
                                    );

                                    //need to aggregate places by smaller radius
                                    if (places.length >= fsqService.limit) {
                                        break_distance_step = false;
                                    }

                                    //save to dictionary
                                    for (let place of places) {
                                        category_distance_dict[category.category_id].places[place.fsq_id] = place;
                                        category_distance_dict[category.category_id][distance_step][place.fsq_id] =
                                            place;
                                    }

                                    console.log({
                                        coords: new_coords,
                                        places: places,
                                    });
                                } catch (e) {
                                    console.error(e);
                                }

                                console.log(new_coords);
                            }
                        }

                        //break distance_step loop
                        if (break_distance_step) {
                            break;
                        }
                    }
                }

                console.log({
                    i,
                });

                resolve();
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
};
