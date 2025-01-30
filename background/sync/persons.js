const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const {
    floatOrNull,
    getURL,
    joinPaths,
    loadScriptEnv,
    timeoutAwait,
    timeNow,
} = require('../../services/shared');
const { getNetworkSelf, getNetworksLookup } = require('../../services/network');
const { deleteKeys } = require('../../services/cache');
const { getGendersLookup } = require('../../services/genders');
const { keys: systemKeys } = require('../../services/system');
const { getGridLookup } = require('../../services/grid');
const { batchInsert, batchUpdate } = require('../../services/db');
const { getKidsAgeLookup } = require('../../services/modes');
const { batchUpdateGridSets } = require('../../services/filters');

let persons_grid_filters = ['online', 'location', 'modes', 'reviews', 'verifications', 'genders'];
let batch_process = 1000;
let defaultTimeout = 20000;

let debug_sync_enabled = require('../../dev/debug').sync.filters;

function processPersons(network_id, persons) {
    function preparePersonCache(new_data, prev_data, params = {}) {
        let { grid, prev_grid, networks } = params;

        let person_data = structuredClone(new_data);

        //grid
        if(grid) {
            if(!prev_grid || prev_grid.token !== grid.token) {
                person_data.grid = {
                    id: grid.id,
                    token: grid.token
                };
            }
        } else {
            person_data.grid = {};
        }

        //modes
        person_data.modes = {
            selected: JSON.parse(new_data.modes) || []
        };

        //networks
        person_data.networks = networks;

        //reviews
        person_data.reviews = {
            count: person_data.reviews_count || 0,
            safety: floatOrNull(person_data.rating_safety),
            trust: floatOrNull(person_data.rating_trust),
            timeliness: floatOrNull(person_data.rating_timeliness),
            friendliness: floatOrNull(person_data.rating_friendliness),
            fun: floatOrNull(person_data.rating_fun),
        };

        if(prev_data) {
            let prev_person_data = structuredClone(prev_data);

            person_data = {
                ...prev_person_data,
                ...person_data
            }

            //merge new selected modes with prev modes data (synced through sequential process)
            if(prev_data.prev_modes) {
                person_data.modes = {
                    ...prev_data.prev_modes,
                    selected: new_data.modes
                }
            }
        }

        return person_data;
    }

    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let gridLookup = await getGridLookup();
            let gendersLookup = await getGendersLookup();
            let networksLookup = await getNetworksLookup();

            //batch process/insert/update
            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            for (let batch of batches) {
                let pipeline = cacheService.startPipeline();
                let prev_modes_pipeline = cacheService.startPipeline();
                let personsToUpdate = [];
                let personsGrids = {};
                let existingPersonsDict = {};
                let existingNetworksDict = {};
                let invalidPersons = {};

                //get existing persons for provided tokens
                let batchPersonTokens = [];
                let batchPersonTokensDict = {};

                for(let person of batch) {
                    batchPersonTokens.push(person.person_token);
                    batchPersonTokensDict[person.person_id] = true;
                }

                let existingPersons = await conn('networks_persons AS np')
                    .join('persons AS p', 'p.id', '=', 'np.person_id')
                    .where('network_id', network_id)
                    .whereIn('person_token', batchPersonTokens)
                    .select('p.*');

                let existingPersonIds = [];

                for(let person of existingPersons) {
                    existingPersonIds.push(person.id);
                    existingPersonsDict[person.person_token] = person;
                }

                let existingNetworks = await conn('networks_persons AS np')
                    .join('networks AS n', 'np.network_id', '=', 'n.id')
                    .whereIn('person_id', existingPersonIds)
                    .where('np.is_active', 1)
                    .select('network_token', 'person_id');

                for(let np of existingNetworks) {
                    if(!existingNetworksDict[np.person_id]) {
                        existingNetworksDict[np.person_id] = new Set();
                    }

                    existingNetworksDict[np.person_id].add(np.network_token);
                }

                //ensure this network has permission to provide updated data for these persons
                for(let person of batch) {
                    if(!existingPersonsDict[person.person_token]) {
                        invalidPersons[person.person_token] = true;
                    }
                }

                //organize lookup, get previous modes
                for (let p of existingPersons) {
                    prev_modes_pipeline.hGet(cacheService.keys.person(p.person_token), 'modes');
                }

                try {
                    let modes_results = await cacheService.execPipeline(prev_modes_pipeline);

                    for(let i = 0; i < existingPersons.length; i++) {
                        let person = existingPersons[i];
                        existingPersonsDict[person.person_token].prev_modes = JSON.parse(modes_results[i]) || null;
                    }
                } catch(e) {
                    console.error(e);
                }

                for (let person of batch) {
                    if (!person) {
                        continue;
                    }

                    let existingPerson = existingPersonsDict[person.person_token];

                    if(!existingPerson) {
                        continue;
                    }

                    let networks = existingNetworksDict[existingPerson.id] ? Array.from(existingNetworksDict[existingPerson.id]) : [];

                    networks = Array.from(networks);

                    let grid = gridLookup.byToken[person.grid_token];
                    let prev_grid = gridLookup.byId[existingPerson?.grid_id];
                    let gender = gendersLookup.byToken[person.gender_token];

                    let person_data;

                    if (person.updated > existingPerson.updated) {
                        person_data = {
                            id: existingPerson.id,
                            grid_id: grid?.id || null,
                            gender_id: gender?.id || null,
                            modes: person.modes,
                            is_new: person.is_new,
                            is_verified_in_person: person.is_verified_in_person,
                            is_verified_linkedin: person.is_verified_linkedin,
                            is_online: person.is_online,
                            timezone: person.timezone,
                            reviews_count: person.reviews_count,
                            rating_safety: person.rating_safety,
                            rating_trust: person.rating_trust,
                            rating_timeliness: person.rating_timeliness,
                            rating_friendliness: person.rating_friendliness,
                            rating_fun: person.rating_fun,
                            age: person.age,
                            is_blocked: person.is_blocked,
                            updated: person.updated,
                            deleted: person.deleted || null
                        };

                        personsToUpdate.push(person_data);

                        let cache_person_data = preparePersonCache(person_data, existingPerson, {
                            grid,
                            prev_grid,
                            networks
                        });

                        pipeline.hSet(cacheService.keys.person(person.person_token), cacheService.prepareSetHash(cache_person_data));

                        personsGrids[person.person_token] = {
                            person: cache_person_data,
                            filter_tokens: [],
                            grid,
                            prev_grid
                        }

                        if(person.is_online !== existingPerson.is_online) {
                            personsGrids[person.person_token].filter_tokens.push('online');
                        }

                        if(grid?.id !== prev_grid?.id) {
                            personsGrids[person.person_token].filter_tokens.push('location');
                        }

                        if(person.modes !== existingPerson.modes) {
                            personsGrids[person.person_token].filter_tokens.push('modes');
                        }

                        if(reviewsChanged(person_data, existingPerson)) {
                            personsGrids[person.person_token].filter_tokens.push('reviews');
                        }

                        if(person.is_verified_in_person !== existingPerson?.is_verified_in_person ||
                            person.is_verified_linkedin !== existingPerson?.is_verified_linkedin) {
                            personsGrids[person.person_token].filter_tokens.push('verifications');
                        }

                        let existingGender = gendersLookup.byId[existingPerson?.gender_id];

                        if(!existingGender || person.gender_token !== existingGender.gender_token) {
                            personsGrids[person.person_token].filter_tokens.push('genders');
                        }
                    }
                }

                if (personsToUpdate.length) {
                    await batchUpdate('persons', personsToUpdate);

                    await cacheService.execPipeline(pipeline);

                    let t = timeNow();

                    //add gender to person sections
                    let genders_pipeline = cacheService.startPipeline();

                    for(let person_token in personsGrids) {
                        let person = personsGrids[person_token];

                        if(person.filter_tokens.includes('genders')) {
                            let gender = gendersLookup.byId[person.person.gender_id];

                            if(gender) {
                                let data = {
                                    [gender.gender_token]: {
                                        id: person.person.id,
                                        token: gender.gender_token,
                                        name: gender.gender_name
                                    }
                                };

                                genders_pipeline.hSet(cacheService.keys.person_sections(person_token), 'genders', JSON.stringify(data));
                            }
                        }
                    }

                    try {
                        await cacheService.execPipeline(genders_pipeline);
                    } catch(e) {
                        console.error(e);
                    }

                    await batchUpdateGridSets(personsGrids);

                    console.log({
                        grid_sets_time: timeNow() - t
                    });
                }
            }
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        return resolve();
    });
}

function reviewsChanged(newData, oldData) {
    return newData.reviews_count !== oldData.reviews_count ||
        newData.rating_safety !== oldData.rating_safety ||
        newData.rating_trust !== oldData.rating_trust ||
        newData.rating_timeliness !== oldData.rating_timeliness ||
        newData.rating_friendliness !== oldData.rating_friendliness ||
        newData.rating_fun !== oldData.rating_fun;
}

function processPersonsModes(network_id, persons_modes) {
    return new Promise(async (resolve, reject) => {
        if(!persons_modes?.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();
            let batches = [];

            for (let i = 0; i < persons_modes.length; i += batch_process) {
                batches.push(persons_modes.slice(i, i + batch_process));
            }

            let [gendersLookup, agesLookup] = await Promise.all([
                getGendersLookup(),
                getKidsAgeLookup()
            ]);

            for (let batch of batches) {
                let pipeline = cacheService.startPipeline();

                let batch_insert = {
                    partners: [],
                    kids: []
                };

                let batch_update = {
                    partners: [],
                    kids: []
                }

                let batchPersonTokens = batch.map(p => p.person_token);

                let existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated');

                let existingPersonsIds = existingPersons.map(p => p.id);

                let existingPersonsPartners = await conn('persons_partner')
                    .whereIn('person_id', existingPersonsIds);

                let existingPersonsKids = await conn('persons_kids')
                    .whereIn('person_id', existingPersonsIds);

                let personsIdTokenMap = {};
                let personsLookup = {};
                let existingPartnersLookup = {};
                let existingKidsLookup = {};

                for (const person of existingPersons) {
                    personsLookup[person.person_token] = person;
                    personsIdTokenMap[person.id] = person.person_token;
                }

                for(let p of existingPersonsPartners) {
                    existingPartnersLookup[p.token] = p;
                }

                for(let k of existingPersonsKids) {
                    existingKidsLookup[k.token] = k;
                }

                for (let person of batch) {
                    const existingPerson = personsLookup[person.person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    if (person.partner) {
                        const partner = person.partner;
                        const gender = gendersLookup.byToken[partner.gender_token];

                        let partnerData = {
                            person_id: existingPerson.id,
                            token: partner.partner_token,
                            gender_id: gender?.id || null,
                            updated: partner.updated,
                            deleted: partner.deleted || null
                        };

                        let existingPartner = existingPartnersLookup[partner.partner_token];

                        if (existingPartner) {
                            if (partner.updated > existingPartner.updated) {
                                partnerData.id = existingPartner.id;
                                batch_update.partners.push(partnerData);
                            }
                        } else if (!partner.deleted) {
                            partnerData.created = timeNow();
                            batch_insert.partners.push(partnerData);
                        }
                    }

                    if (person.kids && Object.keys(person.kids).length) {
                        for (const [kidToken, kid] of Object.entries(person.kids)) {
                            const gender = gendersLookup.byToken[kid.gender_token];
                            const age = agesLookup.byToken[kid.age_token];

                            const kidData = {
                                person_id: existingPerson.id,
                                token: kidToken,
                                gender_id: gender?.id || null,
                                age_id: age?.id || null,
                                is_active: kid.is_active,
                                updated: kid.updated,
                                deleted: kid.deleted || null
                            };

                            const existingKid = existingKidsLookup[kidToken];

                            if (existingKid) {
                                if (kid.updated > existingKid.updated) {
                                    kidData.id = existingKid.id;
                                    batch_update.kids.push(kidData);
                                }
                            } else if (!kid.deleted) {
                                kidData.created = timeNow();
                                batch_insert.kids.push(kidData);
                            }
                        }
                    }
                }

                if(!batch_insert.partners.length && !batch_insert.kids.length &&
                    !batch_update.partners.length && !batch_update.kids.length) {
                    return resolve();
                }

                if(batch_insert.partners.length) {
                    await batchInsert('persons_partner', batch_insert.partners, true);
                }

                if(batch_update.partners.length) {
                    await batchUpdate('persons_partner', batch_update.partners);
                }

                if(batch_insert.kids.length) {
                    await batchInsert('persons_kids', batch_insert.kids, true);
                }

                if(batch_update.kids.length) {
                    await batchUpdate('persons_kids', batch_update.kids);
                }

                //update cache
                let modes_qry = conn('persons')
                    .whereIn('id', existingPersonsIds)
                    .select('id', 'person_token', 'modes');

                let partners_qry = conn('persons_partner')
                    .whereNull('deleted')
                    .whereIn('person_id', existingPersonsIds)
                    .select('id', 'person_id', 'token', 'gender_id');

                let kids_qry = conn('persons_kids')
                    .whereNull('deleted')
                    .whereIn('person_id', existingPersonsIds)
                    .select('id', 'person_id', 'token', 'age_id', 'gender_id', 'is_active');

                let [modes, partners, kids] = await Promise.all([
                    modes_qry, partners_qry, kids_qry
                ]);

                let personsModes = {};

                for(let p of modes) {
                    personsModes[p.person_token] = {
                        selected: JSON.parse(p.modes) || [],
                        partner: {},
                        kids: {}
                    }
                }

                for(let p of partners) {
                    let person_token = personsIdTokenMap[p.person_id];

                    personsModes[person_token].partner = {
                        id: p.id,
                        token: p.token,
                        gender_id: p.gender_id,
                    }
                }

                for(let k of kids) {
                    let person_token = personsIdTokenMap[k.person_id];

                    personsModes[person_token].kids[k.token] = {
                        id: k.id,
                        token: k.token,
                        gender_id: k.gender_id,
                        age_id: k.age_id,
                        is_active: k.is_active
                    }
                }

                for(let person_token in personsModes) {
                    let data = personsModes[person_token];

                    pipeline.hSet(
                        cacheService.keys.person(person_token),
                        'modes',
                        JSON.stringify(data)
                    );
                }

                await cacheService.execPipeline(pipeline);
            }
        } catch (e) {
            console.error('Error in processPersonsModes:', e);
            return reject(e);
        }

         resolve();
    });
}

function updatePersonsCount() {
    return new Promise(async (resolve, reject) => {
        try {
            let network_self = await getNetworkSelf();

            if (!network_self.is_befriend) {
                return resolve();
            }

            let conn = await dbService.conn();

            let networks_persons = await conn('networks_persons AS np')
                .join('persons AS p', 'p.id', '=', 'np.person_id')
                .where('np.network_id', '<>', network_self.id)
                .whereNull('np.deleted')
                .whereNull('p.deleted')
                .select('np.id', 'np.network_id', 'np.person_id');

            let network_count = {};

            for (let item of networks_persons) {
                if (!(item.network_id in network_count)) {
                    network_count[item.network_id] = 0;
                }

                network_count[item.network_id]++;
            }

            for (let network_id in network_count) {
                await conn('networks').where('id', network_id).update({
                    persons_count: network_count[network_id],
                    updated: timeNow(),
                });
            }

            await deleteKeys([cacheService.keys.networks, cacheService.keys.networks_filters]);
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

function syncPersons() {
    console.log("Sync: persons");

    let sync_name = systemKeys.sync.network.persons;

    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch(e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject();
        }

        try {
            conn = await dbService.conn();

            //networks to sync data with
            //networks can be updated through the sync_networks background process
            networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);
        } catch (e) {
            console.error(e);
        }

        if (networks) {
            for (let network of networks) {
                try {
                    let t = timeNow();

                    //in case of error, do not save new last timestamp
                    let skipSaveTimestamps = false;

                    //if error with one network, catch error and continue to next network
                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    //request latest data only on subsequent syncs
                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if (sync_qry && !debug_sync_enabled) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons'));

                    //security_key
                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_to_qry) {
                        continue;
                    }

                    const axiosInstance = axios.create({
                        timeout: defaultTimeout
                    });

                    let response = await axiosInstance.get(sync_url, {
                        params: {
                            secret_key: secret_key_to_qry.secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow(),
                        }
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersons(network.id, response.data.persons);

                    //handle paging, ~10,000 results
                    while (response.data.last_person_token) {
                        try {
                            response = await axiosInstance.get(sync_url, {
                                params: {
                                    secret_key: secret_key_to_qry.secret_key_to,
                                    network_token: network_self.network_token,
                                    last_person_token: response.data.last_person_token,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow(),
                                }
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            await processPersons(network.id, response.data.persons);
                        } catch (e) {
                            console.error(e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        //update sync table
                        if (sync_qry) {
                            await conn('sync').where('id', sync_qry.id).update({
                                last_updated: timestamps.current,
                                updated: timeNow(),
                            });
                        } else {
                            await conn('sync').insert({
                                sync_process: sync_name,
                                network_id: network.id,
                                last_updated: timestamps.current,
                                created: timeNow(),
                                updated: timeNow(),
                            });
                        }
                    }

                    console.log({
                        process_time: timeNow() - t
                    });
                } catch (e) {
                    console.error(e);
                }
            }
        }

        resolve();
    });
}

function syncPersonsModes() {
    return new Promise(async (resolve, reject) => {
        const sync_name = systemKeys.sync.network.persons_modes;
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch(e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network');
            await timeoutAwait(5000);
            return reject();
        }

        try {
            conn = await dbService.conn();

            networks = await conn('networks')
                .where('is_self', false)
                .where('keys_exchanged', true)
                .where('is_online', true)
                .where('is_blocked', false);

            for (let network of networks) {
                try {
                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null
                    };

                    let sync_qry = await conn('sync')
                        .where('network_id', network.id)
                        .where('sync_process', sync_name)
                        .first();

                    if (sync_qry) {
                        timestamps.last = sync_qry.last_updated;
                    }

                    let secret_key_to_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_to_qry) {
                        continue;
                    }

                    let sync_url = getURL(network.api_domain, joinPaths('sync', 'persons/modes'));

                    const axiosInstance = axios.create({
                        timeout: defaultTimeout
                    });

                    let response = await axiosInstance.get(sync_url, {
                        params: {
                            secret_key: secret_key_to_qry.secret_key_to,
                            network_token: network_self.network_token,
                            data_since: timestamps.last,
                            request_sent: timeNow()
                        }
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersonsModes(network.id, response.data.persons_modes);

                    // Handle pagination
                    while (response.data.pagination_updated) {
                        try {
                            response = await axiosInstance.get(sync_url, {
                                params: {
                                    secret_key: secret_key_to_qry.secret_key_to,
                                    network_token: network_self.network_token,
                                    pagination_updated: response.data.pagination_updated,
                                    prev_data_since: response.data.prev_data_since,
                                    request_sent: timeNow()
                                }
                            });

                            if (response.status !== 202) {
                                break;
                            }

                            await processPersonsModes(network.id, response.data.persons_modes);
                        } catch (e) {
                            console.error('Error in pagination:', e);
                            skipSaveTimestamps = true;
                            break;
                        }
                    }

                    if (!skipSaveTimestamps) {
                        if (sync_qry) {
                            await conn('sync')
                                .where('id', sync_qry.id)
                                .update({
                                    last_updated: timestamps.current,
                                    updated: timeNow()
                                });
                        } else {
                            await conn('sync').insert({
                                sync_process: sync_name,
                                network_id: network.id,
                                last_updated: timestamps.current,
                                created: timeNow(),
                                updated: timeNow()
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error syncing with network:', e);
                }
            }
        } catch (e) {
            console.error('Error in syncPersonsModes:', e);
            return reject(e);
        }

        resolve();
    });
}

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            await syncPersons();
            await syncPersonsModes();
            await updatePersonsCount();
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main
}

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}