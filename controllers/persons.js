const cacheService = require('../services/cache');
const dbService = require('../services/db');
const gridService = require('../services/grid');

const {
    timeNow,
    latLonLookup,
    getTimeZoneFromCoords,
    isLatValid,
    isLonValid,
} = require('../services/shared');
const { getPerson, updatePerson, savePerson } = require('../services/persons');
const { getCountryByCode } = require('../services/locations');
const { getPersonFilters, updateGridSets } = require('../services/filters');

const {
    getSections,
    addSection,
    deleteSection,
    addSectionItem,
    updateSectionItem,
    selectSectionOptionItem,
    updateSectionPositions,
    getGenders,
    putModes,
    putPartner,
    addKid,
    updateKid,
    removeKid,
} = require('../services/me');

const { getKidsAgeOptions } = require('../services/modes');
const { rules, getPersonActivities } = require('../services/activities');
const { getPersonNotifications } = require('../services/notifications');
const { getNetworkSelf } = require('../services/network');
const { getPersonReviews, reviewPeriod } = require('../services/reviews');


module.exports = {
    getMe: function (req, res) {
        return new Promise(async (resolve, reject) => {
            let person_token = req.query.person_token;

            try {
                let network = await getNetworkSelf(true);

                let me = await getPerson(person_token);

                let activities = await getPersonActivities(me);
                let notifications = await getPersonNotifications(me);
                let filters = await getPersonFilters(me);
                let reviews = await getPersonReviews(me);

                //set country
                if (me.country_code) {
                    me.country = await getCountryByCode(me.country_code);
                } else {
                    if (req.query.location?.lat && req.query.location?.lon) {
                        try {
                            let country = await latLonLookup(
                                req.query.location?.lat,
                                req.query.location?.lon,
                            );

                            await updatePerson(person_token, {
                                country_code: country.code,
                            });

                            me.country = country;
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }

                let genders = await getGenders(true);

                let kidsAgeOptions = await getKidsAgeOptions();

                let sections = await getSections(me);

                res.json({
                    network,
                    me,
                    notifications,
                    filters,
                    genders,
                    sections,
                    reviews: {
                        reviews,
                        period: reviewPeriod
                    },
                    activities: {
                        rules,
                        activities,
                    },
                    modes: {
                        kids: {
                            options: kidsAgeOptions,
                        },
                    },
                });

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error getting person', 400);
            }
        });
    },
    putOnline: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_token = req.body.person_token;
                let online = req.body.online;

                if (typeof online !== 'boolean') {
                    res.json(
                        {
                            message: 'Invalid request',
                        },
                        400,
                    );

                    return resolve();
                }

                let person = await getPerson(person_token);

                if (!person) {
                    res.json(
                        {
                            message: 'Invalid person',
                        },
                        400,
                    );

                    return resolve();
                }

                //update db
                await updatePerson(person_token, {
                    is_online: online,
                });

                res.json('Online status updated successfully', 202);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error updating online status', 400);
            }
        });
    },
    updateLocation: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let person_token = req.body.person_token;
                let lat = req.body.lat;
                let lon = req.body.lon;
                let force_update = req.body.force_update;

                if (!isLatValid(lat) || !isLonValid(lon)) {
                    res.json(
                        {
                            message: 'Invalid location provided',
                        },
                        400,
                    );

                    return resolve();
                }

                let grid = await gridService.findNearest(lat, lon);

                if (!grid) {
                    res.json(
                        {
                            message: 'Grid not found',
                        },
                        400,
                    );

                    return resolve();
                }

                let conn = await dbService.conn();

                let me = await getPerson(person_token);

                if (!me) {
                    res.json(
                        {
                            message: 'Invalid person',
                        },
                        400,
                    );

                    return resolve();
                }

                //update db
                let dbUpdate = {
                    location_lat: lat,
                    location_lat_1000: Math.floor(parseFloat(lat) * 1000),
                    location_lon: lon,
                    location_lon_1000: Math.floor(parseFloat(lon) * 1000),
                    timezone: getTimeZoneFromCoords(lat, lon),
                    updated: timeNow(),
                };

                let prev_grid_token = me.grid?.token;

                if (!prev_grid_token || prev_grid_token !== grid.token) {
                    dbUpdate.grid_id = grid.id;
                }

                await conn('persons').where('id', me.id).update(dbUpdate);

                //update cache
                //person location cache
                for (let k in dbUpdate) {
                    if(['grid_id'].includes(k)) {
                        continue;
                    }

                    me[k] = dbUpdate[k];
                }

                me.location = {
                    lat: parseFloat(lat.toFixed(4)),
                    lon: parseFloat(lon.toFixed(4)),
                    timezone: dbUpdate.timezone,
                };

                //person grid data/sets
                if (!prev_grid_token || prev_grid_token !== grid.token) {
                    // update grid data on main person object
                    me.grid = {
                        id: grid.id,
                        token: grid.token,
                    };
                }

                //person obj
                await savePerson(person_token, me);

                if (!prev_grid_token || prev_grid_token !== grid.token || force_update) {
                    await updateGridSets(me, null, 'location', prev_grid_token);
                }

                res.json('Location updated successfully', 202);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error getting person', 400);
            }
        });
    },
    putModes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await putModes(req.body.person_token, req.body.modes);

                res.json(data, 200);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error updating mode', 400);
            }
        });
    },
    putCountry: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let { lat, lon, person_token } = req.body;

                if (!lat || !lon || !person_token) {
                    res.json('required params missing', 400);

                    return resolve();
                }

                let person = await getPerson(person_token);

                if (!person) {
                    res.json('person not found', 400);

                    return resolve();
                }

                let country = await latLonLookup(lat, lon);

                if (country?.code) {
                    try {
                        await updatePerson(person_token, {
                            country_code: country.code,
                        });

                        res.json(country, 201);
                    } catch (e) {
                        console.error(e);
                        res.json('error updating person', 400);
                    }
                } else {
                    res.json('Country not found', 400);
                }

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    putMePartner: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                await putPartner(req.body.person_token, req.body.gender_token, req.body.is_select);

                res.json('partner updated', 200);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    postMeKids: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let kid = await addKid(req.body.person_token);

                res.json(kid, 201);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    putMeKids: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                await updateKid(
                    req.body.person_token,
                    req.body.kid_token,
                    req.body.age_token,
                    req.body.gender_token,
                    req.body.is_select,
                    req.body.is_active,
                );

                res.json({
                    success: true,
                });

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    removeMeKids: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                await removeKid(req.body.person_token, req.body.kid_token);

                res.json({
                    success: true,
                });

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    addMeSection: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await addSection(req.body.person_token, req.body.key);

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section', 400);
            }
        });
    },
    deleteMeSection: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await deleteSection(req.body.person_token, req.params.section_key);

                res.json(data, 200);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error deleting section', 400);
            }
        });
    },
    addMeSectionItem: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await addSectionItem(
                    req.body.person_token,
                    req.body.section_key,
                    req.body.table_key,
                    req.body.item_token,
                    req.body.hash_token,
                );

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section item', 400);
            }
        });
    },
    updateMeSectionPositions: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { person_token, positions } = req.body;

                await updateSectionPositions(person_token, positions);

                res.json();

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section item', 400);
            }
        });
    },
    selectMeSectionOptionItem: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { person_token, section_key, table_key, item_token, is_select } = req.body;

                let result = await selectSectionOptionItem(
                    person_token,
                    section_key,
                    table_key,
                    item_token,
                    is_select,
                );

                res.json({
                    data: result,
                });

                resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding section item', 400);
            }
        });
    },
    updateMeSectionItem: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let data = await updateSectionItem(req.body);

                res.json(data, 201);

                resolve();
            } catch (e) {
                console.error(e);

                let msg = e && e.message ? e.message : 'Error adding section item';

                res.json(msg, 400);
            }
        });
    },
    addDevice: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                const { person_token, device_token, platform } = req.body;

                // Validate required fields
                if (!device_token || !platform) {
                    res.status(400).json({ message: 'Device token and platform required' });
                    return resolve();
                }

                // Validate platform
                const normalizedPlatform = platform.toLowerCase();

                if (!['ios', 'android'].includes(normalizedPlatform)) {
                    res.status(400).json({ message: 'Invalid platform' });
                    return resolve();
                }

                // Get person
                const person = await getPerson(person_token);

                if (!person) {
                    res.status(400).json({ message: 'Person token not found' });
                    return resolve();
                }

                const conn = await dbService.conn();
                const timestamp = timeNow();

                // Get existing devices
                const personDevices = await conn('persons_devices').where('person_id', person.id);

                // Handle new device registration
                if (!personDevices.length) {
                    const newDevice = {
                        person_id: person.id,
                        token: device_token,
                        platform: normalizedPlatform,
                        is_current: true,
                        last_updated: timestamp,
                        created: timestamp,
                        updated: timestamp,
                    };

                    const [id] = await conn('persons_devices').insert(newDevice);
                    newDevice.id = id;

                    await cacheService.hSet(cacheService.keys.person(person_token), 'devices', [
                        newDevice,
                    ]);

                    res.status(201).json({ message: 'Added successfully' });
                    return resolve();
                }

                // Handle existing devices
                const existingDevice = personDevices.find((d) => d.platform === normalizedPlatform);

                if (!existingDevice) {
                    res.status(400).json({
                        message: 'Unexpected state: Platform device not found',
                    });
                    return resolve();
                }

                const needsUpdate =
                    existingDevice.token !== device_token || !existingDevice.is_current;

                if (!needsUpdate) {
                    res.status(200).json({ message: 'No update needed' });
                    return resolve();
                }

                // Update devices
                if (personDevices.length > 1) {
                    // Set all devices to not current
                    await conn('persons_devices').where('person_id', person.id).update({
                        is_current: false,
                        updated: timestamp,
                    });
                }

                // Update the target device
                await conn('persons_devices').where('id', existingDevice.id).update({
                    token: device_token,
                    is_current: true,
                    last_updated: timestamp,
                    updated: timestamp,
                });

                // Update cache
                const updatedDevices = personDevices.map((device) => ({
                    ...device,
                    is_current: device.id === existingDevice.id,
                    token: device.id === existingDevice.id ? device_token : device.token,
                    last_updated: device.id === existingDevice.id ? timestamp : device.last_updated,
                    updated: timestamp,
                }));

                await cacheService.hSet(
                    cacheService.keys.person(person_token),
                    'devices',
                    updatedDevices,
                );

                res.status(200).json({ message: 'Devices updated' });
                return resolve();
            } catch (e) {
                console.error(e);
                res.json('Error adding device', 400);
            }
        });
    },
};
