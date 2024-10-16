const axios = require("axios");
const { getMetersFromMilesOrKm } = require("./shared");
module.exports = {
    limit: 50,
    fields: {
        core: `fsq_id,closed_bucket,distance,geocodes,location,name,timezone`, //categories,chains,link,related_places
        rich: `price,description,hours,hours_popular,rating,popularity,venue_reality_bucket,photos`, //verified,stats,menu,date_closed,photos,tips,tastes,features,store_id,
    },
    getPlacesByCategory: function (lat, lon, radius_mkm, category_id) {
        function getUrlFromHeader(string) {
            if (!string) {
                return null;
            }

            try {
                return string.substring(1).split(">;")[0];
            } catch (e) {}

            return null;
        }

        return new Promise(async (resolve, reject) => {
            const api_key = process.env.FSQ_KEY;

            const base_url = "https://api.foursquare.com/v3/places/search";

            let places = [];
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
                        response = await axios.get(base_url, {
                            headers: {
                                Accept: "application/json",
                                Authorization: api_key,
                            },
                            params: {
                                fields: `${module.exports.fields.core},${module.exports.fields.rich}`,
                                ll: `${lat},${lon}`,
                                categories: category_id,
                                radius: getMetersFromMilesOrKm(radius_mkm, true),
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
                    places.push(place);
                    places_dict[place.fsq_id] = place;
                }

                next_url = getUrlFromHeader(response.headers.link);

                if (!next_url) {
                    break;
                }
            }

            resolve(Object.values(places_dict));
        });
    },
};
