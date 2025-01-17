const axios = require('axios');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');

const {
    loadScriptEnv,
    timeoutAwait,
    timeNow,
    getURL,
    joinPaths,
} = require('../../services/shared');
const { getNetworkSelf } = require('../../services/network');
const { deleteKeys } = require('../../services/cache');
const { getGendersLookup } = require('../../services/genders');
const { keys: systemKeys } = require('../../services/system');
const { getGridLookup } = require('../../services/grid');
const { batchInsert, batchUpdate } = require('../../services/db');
const { getKidsAgeLookup } = require('../../services/modes');

const sync_name = systemKeys.sync.network.persons;

let batch_process = 1000;

function processPersons(network_id, persons) {
    function preparePersonCache(new_data, prev_data, params = {}) {
        let { grid, prev_grid } = params;

        let person_data = structuredClone(new_data);

        //grid
        if(!prev_grid || prev_grid.token !== grid.token) {
            person_data.grid = {
                id: grid.id,
                token: grid.token
            };
        }

        //modes
        person_data.modes = {
            selected: JSON.parse(new_data.modes) || []
        };

        if(prev_data) {
            let prev_person_data = structuredClone(prev_data);

            person_data = {
                ...prev_person_data,
                ...person_data
            }

            //merge new selected modes with prev modes data (synced through sequential process)
            if(prev_data.modes) {
                person_data.modes = {
                    ...prev_data.modes,
                    selected: new_data.modes
                }
            }
        }

        person_data = cacheService.prepareSetHash(person_data);

        return person_data;
    }

    return new Promise(async (resolve, reject) => {
        if (!persons || !persons.length) {
            return resolve();
        }

        try {
            let conn = await dbService.conn();

            let gridLookup = await getGridLookup();
            let genders = await getGendersLookup();

            //batch process/insert/update
            let batches = [];

            for (let i = 0; i < persons.length; i += batch_process) {
                batches.push(persons.slice(i, i + batch_process));
            }

            let t = timeNow();

            for (let batch of batches) {
                let pipeline = cacheService.startPipeline();
                let prev_modes_pipeline = cacheService.startPipeline();
                let personsToInsert = [];
                let personsToUpdate = [];
                let networksToInsert = [];
                let personsGrids = {};
                let existingPersonsDict = {};
                let existingNetworksDict = {};

                //check for existing persons
                const batchPersonTokens = batch.map(p => p.person_token);

                const existingPersons = await conn('persons')
                    .whereIn('person_token', batchPersonTokens)
                    .select('id', 'person_token', 'updated', 'deleted');

                //organize lookup
                for (const p of existingPersons) {
                    existingPersonsDict[p.person_token] = p;
                    prev_modes_pipeline.hGet(cacheService.keys.person(p.person_token), 'modes');
                }

                try {
                    let modes_results = await cacheService.execPipeline(prev_modes_pipeline);

                    for(let i = 0; i < existingPersons.length; i++) {
                        let person = existingPersons[i];
                        existingPersonsDict[person.person_token].modes = JSON.parse(modes_results[i]) || null;
                    }
                } catch(e) {
                    console.error(e);
                }

                //check for existing persons networks
                const existingPersonIds = existingPersons.map(p => p.id);

                const existingNetworks = await conn('persons_networks')
                    .where('network_id', network_id)
                    .whereIn('person_id', existingPersonIds)
                    .select('person_id');

                //organize persons networks lookup
                for (const network of existingNetworks) {
                    existingNetworksDict[network.person_id] = true;
                }

                //todo - prepare grid set data
                for (let person of batch) {
                    if (!person) {
                        continue;
                    }

                    let existingPerson = existingPersonsDict[person.person_token];

                    let grid = gridLookup.byToken[person.grid_token];
                    let prev_grid = gridLookup.byId[existingPerson?.grid_id];
                    let gender = genders.byToken[person.gender_token];

                    let person_data;

                    if (!existingPerson) {
                        if (person.deleted) {
                            continue;
                        }

                        person_data = {
                            network_id,
                            grid_id: grid?.id || null,
                            gender_id: gender?.id || null,
                            person_token: person.person_token,
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
                            created: timeNow(),
                            updated: person.updated
                        };

                        personsToInsert.push(person_data);

                        let cache_person_data = preparePersonCache(person_data, null, {
                            grid
                        });

                        pipeline.hSet(cacheService.keys.person(person.person_token), cache_person_data);
                    } else if (person.updated > existingPerson.updated) {
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
                            prev_grid
                        });

                        pipeline.hSet(cacheService.keys.person(person.person_token), cache_person_data);
                    }

                    //update persons networks
                    if (existingPerson && !existingNetworksDict[existingPerson.id]) {
                        networksToInsert.push({
                            person_id: existingPerson.id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: timeNow()
                        });
                    }
                }

                if (personsToInsert.length) {
                    await batchInsert('persons', personsToInsert, true);

                    for(let p of personsToInsert) {
                        networksToInsert.push({
                            person_id: p.id,
                            network_id: network_id,
                            created: timeNow(),
                            updated: timeNow()
                        })
                    }
                }

                if (personsToUpdate.length) {
                    await batchUpdate('persons', personsToUpdate);
                }

                if (networksToInsert.length) {
                    await batchInsert('persons_networks', networksToInsert);
                }

                if(personsToInsert.length || personsToUpdate.length) {
                    await cacheService.execPipeline(pipeline);
                }
            }

            console.log({
                process_time: timeNow() - t
            });
        } catch (e) {
            console.error(e);
            return reject(e);
        }

        return resolve();
    });
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

            let [genders, ages] = await Promise.all([
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
                    existingKidsLookup[p.token] = k;
                }

                for (let person of batch) {
                    const existingPerson = personsLookup[person.person_token];

                    if (!existingPerson) {
                        continue;
                    }

                    if (person.partner) {
                        const partner = person.partner;
                        const gender = genders.byToken[partner.gender_token];

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
                            const gender = genders.byToken[kid.gender_token];
                            const age = ages.byToken[kid.age_token];

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

                let kids_qry = conn('persons_kid')
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

                if(
                    batch_insert.partners.length || batch_insert.kids.length ||
                    batch_update.partners.length || batch_update.kids.length) {
                    await cacheService.execPipeline(pipeline);
                }
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

            let networks_persons = await conn('persons_networks AS pn')
                .join('persons AS p', 'p.id', '=', 'pn.person_id')
                .where('pn.network_id', '<>', network_self.id)
                .whereNull('pn.deleted')
                .whereNull('p.deleted')
                .select('pn.id', 'pn.network_id', 'pn.person_id');

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
    });
}

function syncPersons() {
    return new Promise(async (resolve, reject) => {
        let conn, networks, network_self;

        try {
            network_self = await getNetworkSelf();
        } catch(e) {
            console.error(e);
        }

        if (!network_self) {
            console.error('Error getting own network', e);
            await timeoutAwait(5000);
            return reject(e);
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

                    if (sync_qry) {
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

                    let response = await axios.post(sync_url, {
                        secret_key: secret_key_to_qry.secret_key_to,
                        network_token: network_self.network_token,
                        data_since: timestamps.last,
                        request_sent: timeNow(),
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersons(network.id, response.data.persons);

                    //handle paging, ~10,000 results
                    while (response.data.last_person_token) {
                        try {
                            response = await axios.post(sync_url, {
                                secret_key: secret_key_to_qry.secret_key_to,
                                network_token: network_self.network_token,
                                last_person_token: response.data.last_person_token,
                                prev_data_since: response.data.prev_data_since,
                                request_sent: timeNow(),
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

                    if (!skipSaveTimestamps) {
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
            console.error('Error getting own network', e);
            await timeoutAwait(5000);
            return reject(e);
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

                    let response = await axios.post(sync_url, {
                        secret_key: secret_key_to_qry.secret_key_to,
                        network_token: network_self.network_token,
                        data_since: timestamps.last,
                        request_sent: timeNow()
                    });

                    if (response.status !== 202) {
                        continue;
                    }

                    await processPersonsModes(network.id, response.data.persons_modes);

                    // Handle pagination
                    while (response.data.last_person_token) {
                        try {
                            response = await axios.post(sync_url, {
                                secret_key: secret_key_to_qry.secret_key_to,
                                network_token: network_self.network_token,
                                last_person_token: response.data.last_person_token,
                                prev_data_since: response.data.prev_data_since,
                                request_sent: timeNow()
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