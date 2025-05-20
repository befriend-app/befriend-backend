const axios = require('axios');
const tldts = require('tldts');
const activitiesService = require('../services/activities');
const placesService = require('../services/places');
const cacheService = require('../services/cache');
const dbService = require('../services/db');
const encryptionService = require('../services/encryption');
const networkService = require('../services/network');
const moviesService = require('../services/movies');
const tvService = require('../services/tv');

const sectionData = require('../services/sections_data');

const { getPerson } = require('../services/persons');
const { getCategoriesPlaces, placesAutoComplete, travelTimes } = require('../services/places');
const { cityAutoComplete } = require('../services/locations');
const { schoolAutoComplete } = require('../services/schools');
const { getTopArtistsForGenre, musicAutoComplete } = require('../services/music');
const { getTopTeamsBySport, sportsAutoComplete } = require('../services/sports');

const { timeNow, generateToken, normalizeSearch, isValidPhone, isValidEmail, getIPAddr } = require('../services/shared');
const { getActivityTypes } = require('../services/activities');
const { getPlaceData } = require('../services/fsq');
const { country_codes } = require('../services/sms');
const { loginEmail, logoutUser, checkAccountExists, sendAuthCode, verifyAuthCode, setPassword, resetPassword,
    setPasswordWithCode
} = require('../services/account');

module.exports = {
    getNetworks: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let cache_key = cacheService.keys.networks_public;
                let cache_data = await cacheService.getObj(cache_key);

                if (cache_data) {
                    return resolve(cache_data);
                }

                let conn = await dbService.conn();

                let networks = await conn('networks AS n')
                    .join('networks AS n2', 'n.registration_network_id', '=', 'n2.id')
                    // .where('created', '<', timeNow() - 60000)
                    .orderBy('n.is_verified', 'desc')
                    .orderBy('n.is_befriend', 'desc')
                    .orderBy('n.priority', 'asc')
                    .select(
                        'n.network_token',
                        'n.network_name',
                        'n.network_logo',
                        'n.app_icon',
                        'n.base_domain',
                        'n.api_domain',
                        'n.persons_count',
                        'n.priority',
                        'n.is_network_known',
                        'n.is_befriend',
                        'n.is_verified',
                        'n.is_active',
                        'n.is_blocked',
                        'n.is_online',
                        'n.last_online',
                        'n.created',
                        'n.updated',
                        'n2.network_token AS registration_network_token',
                    );

                await cacheService.setCache(cache_key, cache_data);

                res.json({
                    networks: networks,
                });
            } catch (e) {
                res.json('Error getting networks', 400);
            }
        });
    },
    addNetwork: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //befriend home
            try {
                let new_network = await networkService.addNetwork(req.body);

                res.json(new_network);
            } catch (e) {
                res.json(e, 400);
            }

            return resolve();
        });
    },
    exchangeKeysHomeFrom: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //network n
            try {
                await networkService.exchangeKeysHomeFrom(req.body);

                res.json(
                    {
                        message: 'Step completed successfully',
                    },
                    201,
                );
            } catch (e) {
                res.json(e, 400);
            }

            resolve();
        });
    },
    exchangeKeysHomeTo: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //befriend home
            try {
                await networkService.exchangeKeysHomeTo(req.body);

                res.json(
                    {
                        message: 'Keys exchanged successfully',
                    },
                    201,
                );
            } catch (e) {
                res.json(e, 400);
            }

            resolve();
        });
    },
    exchangeKeysHomeSave: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //network n
            try {
                await networkService.exchangeKeysHomeSave(req.body);

                res.json(
                    {
                        message: 'Keys saved successfully',
                    },
                    201,
                );
            } catch (e) {
                res.json(e, 400);
            }

            resolve();
        });
    },
    keysExchangeEncrypt: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                await networkService.keysExchangeEncrypt(req.body);

                res.json(
                    {
                        message: 'Keys encrypted successfully',
                    },
                    201,
                );
            } catch (e) {
                res.json(e, 400);
            }

            resolve();
        });
    },
    keysExchangeDecrypt: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //request received on to_network
            try {
                await networkService.keysExchangeDecrypt(req.body);

                res.json('Keys exchanged successfully', 201);
            } catch (e) {
                res.json(e, 400);
            }

            resolve();
        });
    },
    keysExchangeSave: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //request received on from_network
            try {
                let keys = await networkService.keysExchangeSave(req.body);

                res.json(keys, 201);
            } catch (e) {
                res.json(e, 400);
            }
        });
    },
    loginEmail: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let email = req.body.email;
                let password = req.body.password;

                let {person_token, login_token} = await loginEmail(email, password);

                res.json(
                    {
                        person_token,
                        login_token,
                        message: 'Login Successful',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                // handle logic for different errors
                res.json(e?.message || 'Login failed', e?.status || 400);
                return reject(e);
            }
        });
    },
    logoutUser: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_token = req.body.person_token;
                let login_token = req.body.login_token;

                await logoutUser(person_token, login_token);

                res.json(
                    {
                        message: 'Sign Out Successful',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                res.json('Sign out failed', 400);
                return reject(e);
            }
        });
    },
    passwordInit: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_token = req.body.person_token;
                let password = req.body.password;

                await setPassword(person_token, password, null);

                res.json(
                    {
                        message: 'Password set successfully',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                res.json(e?.message || 'Error setting password', 400);
                return reject(e);
            }
        });
    },
    resetPassword: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let email = req.body.email;

                await resetPassword(email);

                res.json(
                    {
                        message: 'Password reset successfully',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                res.json(e?.message || 'Error re-setting password', 400);
                return reject(e);
            }
        });
    },
    setPasswordWithCode: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let email = req.body.email;
                let password = req.body.password;
                let code = req.body.code;

                await setPasswordWithCode(email, password, code);

                res.json(
                    {
                        message: 'Password set successfully',
                    },
                    200,
                );

                return resolve();
            } catch (e) {
                res.json(e?.message || 'Error setting password', 400);
                return reject(e);
            }
        });
    },
    checkLoginExists: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let phoneObj = req.body.phone;
                let email = req.body.email;

                let exists = await checkAccountExists(phoneObj, email);

                if(!exists){
                    await sendAuthCode(phoneObj, email, 'signup', getIPAddr(req));
                }

                res.json(exists, 200);

                return resolve();
            } catch (e) {
                res.json(e?.message || 'Login check error', 400);
                return reject(e);
            }
        });
    },
    verifyAuthCode: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let code = req.body.code;
                let phoneObj = req.body.phone;
                let email = req.body.email;

                let loginData = await verifyAuthCode(code, phoneObj, email);

                res.json(loginData, 200);

                return resolve();
            } catch (e) {
                res.json(e?.message || 'Auth code verification error', e?.status || 400);
                return reject(e);
            }
        });
    },
    getActivityTypes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await getActivityTypes();

                res.json(data);
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error getting activity types data',
                    },
                    400,
                );
            }

            return resolve();
        });
    },
    getActivityTypePlaces: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let activity_type, location;

            try {
                let activity_type_token = req.params.activity_type_token;

                if (!activity_type_token) {
                    res.json(
                        {
                            message: 'activity_type token required',
                        },
                        400,
                    );

                    return resolve();
                }

                location = req.body.location;

                if (!location || !location.map || !(location.map.lat && location.map.lon)) {
                    res.json(
                        {
                            message: 'Location required',
                        },
                        400,
                    );

                    return resolve();
                }

                let conn = await dbService.conn();

                //get fsq_ids from cache or db
                let cache_key =
                    cacheService.keys.activity_type_venue_categories(activity_type_token);

                let activity_fsq_ids = await cacheService.getObj(cache_key);

                if (!activity_fsq_ids) {
                    //get activity type by token
                    activity_type = await activitiesService.getActivityType(activity_type_token);

                    if (!activity_type) {
                        res.json(
                            {
                                message: 'Activity type not found',
                            },
                            400,
                        );

                        return resolve();
                    }

                    //get fsq ids for activity type
                    let categories_qry = await conn('activity_type_venues AS atv')
                        .join('venues_categories AS vc', 'vc.id', '=', 'atv.venue_category_id')
                        .where('atv.activity_type_id', activity_type.id)
                        .where('atv.is_active', true)
                        .orderBy('atv.sort_position')
                        .select('vc.fsq_id');

                    activity_fsq_ids = categories_qry.map((x) => x.fsq_id);

                    await cacheService.setCache(cache_key, activity_fsq_ids);
                }

                try {
                    let places = await getCategoriesPlaces(activity_fsq_ids, location);

                    res.json({
                        places: places,
                    });
                } catch (e) {
                    console.error(e);

                    res.json(
                        {
                            message: 'Error getting category(s) places',
                        },
                        400,
                    );
                }
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Error getting places for activity',
                    },
                    400,
                );
            }

            return resolve();
        });
    },
    getMapboxToken: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //get temporary mapbox token for use in app

            let expires_when = Date.now() + 60 * 60 * 1000;
            let expires = new Date(expires_when).toISOString();

            const tokenConfig = {
                note: 'Temporary token for accessing maps',
                expires: new Date(expires),
                scopes: [
                    'styles:tiles',
                    'styles:read', // Allow reading styles
                    'fonts:read', // Allow reading fonts
                    'datasets:read',
                    'tilesets:read', // Allow reading tilesets
                ],
            };

            try {
                const response = await axios.post(
                    `https://api.mapbox.com/tokens/v2/${process.env.MAPBOX_USER}?access_token=${process.env.MAPBOX_SECRET_KEY}`,
                    tokenConfig,
                );

                res.json(
                    {
                        expires: expires_when,
                        token: response.data.token,
                    },
                    200,
                );
            } catch (e) {
                console.error(e);

                res.json('Error getting map token', 400);
            }

            resolve();
        });
    },
    placesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { session_token, search, location, friends } = req.body;

                if (!session_token) {
                    res.json(
                        {
                            message: 'Session token required',
                        },
                        400,
                    );

                    return resolve();
                }

                if (!search || search.length < placesService.autoComplete.minChars) {
                    res.json(
                        {
                            message: `Search string must be at least ${placesService.autoComplete.minChars} characters`,
                        },
                        400,
                    );

                    return resolve();
                }

                if (!location || !location.map || !(location.map.lat && location.map.lon)) {
                    res.json(
                        {
                            message: 'Location required',
                        },
                        400,
                    );

                    return resolve();
                }

                const results = await placesAutoComplete(session_token, search, location, friends);

                res.json({
                    places: results,
                });
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Search for places error',
                    },
                    400,
                );
            }

            resolve();
        });
    },
    citiesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { search, lat, lon } = req.body;

                if (!search) {
                    res.json(
                        {
                            message: 'Search string is required',
                        },
                        400,
                    );

                    return resolve();
                }

                const results = await cityAutoComplete(search, lat, lon);

                res.json({
                    cities: results,
                });
            } catch (e) {
                console.error(e);

                res.json(
                    {
                        message: 'Autocomplete error',
                    },
                    400,
                );
            }

            resolve();
        });
    },
    getGeoCode: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let place = req.body.place;

            if (!place || !place.fsq_address_id) {
                return reject('Address id required');
            }

            let token = process.env.MAPBOX_SECRET_KEY;

            let cache_key = cacheService.keys.address_geo(place.fsq_address_id);

            try {
                let cache_data = await cacheService.getObj(cache_key);

                if (cache_data && cache_data.geo) {
                    res.json(
                        {
                            geo: cache_data.geo,
                        },
                        200,
                    );

                    return resolve();
                }
            } catch (e) {
                console.error(e);
            }

            let country = '';
            let locality = '';
            let region = '';
            let address_line_1 = '';
            let postcode = '';

            if (place.location_country) {
                country = place.location_country;
            }

            if (place.location_locality) {
                locality = `&locality=${place.location_locality}`;
            }

            if (place.location_region) {
                region = `&region=${place.location_region}`;
            }

            if (place.location_address) {
                address_line_1 = `&address_line1=${place.location_address}`;
            }

            if (place.location_postcode) {
                postcode = `&postcode=${place.location_postcode}`;
            }

            let url = `https://api.mapbox.com/search/geocode/v6/forward?country=${country}${locality}${region}${address_line_1}${postcode}&access_token=${token}`;

            try {
                const response = await axios.get(url);

                if (!response.data.features.length) {
                    res.json('No coordinates', 400);

                    return resolve();
                }

                let geo = {
                    lat: response.data.features[0].geometry.coordinates[1],
                    lon: response.data.features[0].geometry.coordinates[0],
                };

                place.location_lat = geo.lat;
                place.location_lon = geo.lon;

                await cacheService.setCache(cache_key, place);

                res.json(
                    {
                        geo: geo,
                    },
                    200,
                );
            } catch (e) {
                console.error(e);

                res.json('Error getting geocode', 400);
            }

            resolve();
        });
    },
    travelTimes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let travel_times = await travelTimes(req.body.when, req.body.from, req.body.to);

                res.json(travel_times);
            } catch (e) {
                console.error(e);
                res.json('Error getting travel times', 400);
            }
        });
    },
    instrumentsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            search = normalizeSearch(search);

            let prefix_key = cacheService.keys.instruments_prefix(search);

            try {
                let unique = {};

                let tokens = await cacheService.getSortedSetByScore(prefix_key);

                for (let token of tokens) {
                    unique[token] = true;
                }

                let pipeline = await cacheService.startPipeline();

                for (let token in unique) {
                    pipeline.hGet(cacheService.keys.instruments, token);
                }

                let items = await cacheService.execMulti(pipeline);

                for (let i = 0; i < items.length; i++) {
                    items[i] = JSON.parse(items[i]);
                }

                res.json(
                    {
                        items: items,
                    },
                    200,
                );

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    musicAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;
            let location = req.query.location;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await musicAutoComplete(search, category, location);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    getTopMusicArtistsByGenre: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let genre_token = req.query.category_token;

            if (!genre_token) {
                res.json('Genre token required', 400);
                return resolve();
            }

            try {
                let items = await getTopArtistsForGenre(genre_token);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Error getting artists', 400);
                return resolve();
            }
        });
    },
    getTopTeamsBySport: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let token = req.query.category_token;

            if (!token) {
                res.json('Token required', 400);
                return resolve();
            }

            try {
                let person = await getPerson(req.query.person_token);

                if (!person) {
                    res.json('Person not found', 400);
                    return resolve();
                }

                let items = await getTopTeamsBySport(token, person.country_code);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Error getting artists', 400);
                return resolve();
            }
        });
    },
    moviesAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await moviesService.moviesAutoComplete(search, category);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    getTopMoviesByCategory: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { category_token } = req.query;

                if (!category_token) {
                    return res.json({ items: [] }, 200);
                }

                // Get top movies based on category
                const items = await moviesService.getTopMoviesByCategory(category_token, true);

                // Format response
                const formattedItems = items.map((movie) => ({
                    token: movie.token,
                    name: movie.name,
                    poster: movie.poster,
                    release_date: movie.release_date,
                    label: movie.label,
                    meta: movie.meta,
                    popularity: movie.popularity,
                    vote_count: movie.vote_count,
                    vote_average: movie.vote_average,
                }));

                res.json(
                    {
                        items: formattedItems,
                    },
                    200,
                );
            } catch (e) {
                console.error('Error getting top movies by category:', e);
                res.json({ error: 'Error getting movies' }, 400);
            }

            resolve();
        });
    },
    getTopShowsByCategory: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { category_token } = req.query;

                if (!category_token) {
                    return res.json({ items: [] }, 200);
                }

                // Get top shows based on category
                const items = await tvService.getTopShowsByCategory(category_token, true);

                // Format response
                const formattedItems = items.map((show) => ({
                    token: show.token,
                    name: show.name,
                    poster: show.poster,
                    first_air_date: show.first_air_date,
                    year_from: show.year_from,
                    year_to: show.year_to,
                    label: show.label,
                    meta: show.meta,
                    popularity: show.popularity,
                    vote_count: show.vote_count,
                    vote_average: show.vote_average,
                }));

                res.json(
                    {
                        items: formattedItems,
                    },
                    200,
                );
            } catch (e) {
                console.error('Error getting top TV shows by category:', e);
                res.json({ error: 'Error getting TV shows' }, 400);
            }

            resolve();
        });
    },
    schoolsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let countryId = req.query.filterId;
            let search = req.query.search;
            let location = req.query.location;

            if (!countryId || !search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await schoolAutoComplete(countryId, search, location);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    sportsAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let person = await getPerson(req.query.person_token);

                let items = await sportsAutoComplete(search, category, person?.country_code);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    TVAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let items = await tvService.tvShowsAutoComplete(search, category);

                res.json({
                    items: items,
                });
            } catch (e) {
                console.error(e);

                res.json('Autocomplete error', 400);
                return resolve();
            }
        });
    },
    workAutoComplete: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let search = req.query.search;
            let category = req.query.category;

            if (!search) {
                res.json('Invalid search', 400);
                return resolve();
            }

            try {
                let section_data = sectionData.work;
                let search_term = normalizeSearch(search);

                if (search_term.length < section_data.autoComplete.minChars) {
                    return resolve([]);
                }

                let results = {
                    industries: [],
                    roles: [],
                };

                // Get industries and roles from cache
                const [industries, roles] = await Promise.all([
                    cacheService.hGetAllObj(cacheService.keys.work_industries),
                    cacheService.hGetAllObj(cacheService.keys.work_roles),
                ]);

                // Function to calculate match score
                function calculateMatchScore(name, searchTerm) {
                    const nameLower = name.toLowerCase();
                    if (nameLower === searchTerm) return 1;
                    if (nameLower.startsWith(searchTerm)) return 0.8;
                    if (nameLower.includes(searchTerm)) return 0.6;
                    return 0;
                }

                // Process industries
                for (const [token, industryData] of Object.entries(industries)) {
                    // Skip if not visible or deleted
                    if (!industryData.is_visible || industryData.deleted) continue;

                    const score = calculateMatchScore(industryData.name, search_term);

                    if (score > 0) {
                        results.industries.push({
                            token: token,
                            name: industryData.name,
                            table_key: 'industries',
                            label: 'Industry',
                            score: score,
                        });
                    }
                }

                // Process roles
                for (const [token, roleData] of Object.entries(roles)) {
                    // Skip if not visible or deleted
                    if (!roleData.is_visible || roleData.deleted) continue;

                    const score = calculateMatchScore(roleData.name, search_term);

                    if (score > 0) {
                        results.roles.push({
                            token: token,
                            name: roleData.name,
                            table_key: 'roles',
                            label: 'Role',
                            category_token: roleData.category_token,
                            category_name: roleData.category_name,
                            score: score,
                        });
                    }
                }

                // Sort results by:
                // 1. Score (higher first)
                // 2. Name (alphabetically)
                for (let k in results) {
                    results[k].sort((a, b) => {
                        if (b.score !== a.score) {
                            return b.score - a.score;
                        }
                        return a.name.localeCompare(b.name);
                    });
                }

                // Only take top results
                res.json({
                    items: results.industries.concat(results.roles),
                });
            } catch (e) {
                console.error(e);
                res.json('Autocomplete error', 400);
            }

            resolve();
        });
    },
    getPlaceFSQ: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let id = req.params.id;

            if (!id) {
                res.json('FSQ id required', 400);
                return resolve();
            }

            try {
                let data = await getPlaceData(id);

                res.json(data);
            } catch (e) {
                console.error(e);
                res.json('Could not retrieve place data', 400);
                return resolve();
            }

            resolve();
        });
    },
    smsCountryCodes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                res.json(country_codes);
            } catch(e) {

            }

            resolve();
        });
    }
};
