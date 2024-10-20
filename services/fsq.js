const axios = require("axios");
const { getMetersFromMilesOrKm } = require("./shared");
module.exports = {
    base_url: "https://api.foursquare.com/v3/places/search",
    limit: 50,
    fields: {
        core: `fsq_id,closed_bucket,distance,geocodes,location,name,timezone`, //categories,chains,link,related_places
        rich: `price,description,hours,hours_popular,rating,popularity,venue_reality_bucket,photos`, //verified,stats,menu,date_closed,photos,tips,tastes,features,store_id,
    },
    getPlacesByCategory: function (lat, lon, radius_mkm, category_id) {
        const api_key = process.env.FSQ_KEY;

        function getUrlFromHeader(string) {
            if (!string) {
                return null;
            }

            try {
                return string.substring(1).split(">;")[0];
            } catch (e) {}

            return null;
        }

        function getPlaces(radius) {
            return new Promise(async (resolve, reject) => {
                let places_dict = {};
                let next_url = null;
                let offset = 0;

                while (true) {
                    let response;

                    if (next_url) {
                        try {
                            response = await axios.get(next_url, {
                                headers: {
                                    Accept: "application/json",
                                    Authorization: api_key,
                                },
                                params: {},
                            });
                        } catch (e) {
                            console.error(e);
                            return reject();
                        }
                    } else {
                        try {
                            response = await axios.get(module.exports.base_url, {
                                headers: {
                                    Accept: "application/json",
                                    Authorization: api_key,
                                },
                                params: {
                                    fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                                    ll: `${lat},${lon}`,
                                    categories: category_id,
                                    radius: getMetersFromMilesOrKm(radius, true),
                                    limit: module.exports.limit,
                                    offset: offset,
                                },
                            });
                        } catch (e) {
                            console.error(e);
                            return reject();
                        }
                    }

                    const { results } = response.data;

                    for (let place of results) {
                        places_dict[place.fsq_id] = place;
                    }

                    next_url = getUrlFromHeader(response.headers.link);

                    if (!next_url) {
                        break;
                    }
                }

                resolve(Object.values(places_dict));
            });
        }

        return new Promise(async (resolve, reject) => {
            let radius = radius_mkm;

            let results = [];

            while (true) {
                try {
                    results = await getPlaces(radius);

                    if (results.length) {
                        break;
                    }

                    //increase search radius on next call if no results
                    if (radius < 5) {
                        radius = 5;
                    } else if (radius < 15) {
                        radius = 15;
                    } else if (radius < 30) {
                        radius = 30;
                    } else {
                        break;
                    }
                } catch (e) {
                    console.error(e);
                    break;
                }
            }

            resolve(results);
        });
    },
};
