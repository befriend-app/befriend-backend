const dbService = require('../db');
const { getNetworkSelf, getNetworksLookup } = require('../network');
const { timeNow, isNumeric } = require('../shared');
const { getGridLookup } = require('../grid');
const { getGendersLookup } = require('../genders');
const { getKidsAgeLookup } = require('../modes');
const { results_limit, data_since_ms_extra } = require('./common');

function createPerson(network, inputs) {
    return new Promise(async (resolve, reject) => {
        try {
            if(typeof inputs.person_token !== 'string' || !isNumeric(inputs.updated)) {
                return reject({
                    message: 'Person token and updated fields required'
                });
            }

            let conn = await dbService.conn();

            let person_check = await conn('persons')
                .where('person_token', inputs.person_token)
                .first();

            if(person_check) {
                return reject({
                    message: 'Person already known'
                });
            }

            let [id] = await conn('persons')
                .insert({
                    is_person_known: true,
                    registration_network_id: network.id,
                    person_token: inputs.person_token,
                    created: timeNow(),
                    updated: inputs.updated - 1 //this ensures sync will work
                });

            await conn('networks_persons')
                .insert({
                    network_id: network.id,
                    person_id: id,
                    is_active: true,
                    created: timeNow(),
                    updated: timeNow()
                });

            resolve();
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function syncNetworksPersons(inputs) {
    return new Promise(async (resolve, reject) => {
        //return all known network->person relationships
        try {
            let conn = await dbService.conn();

            let request_sent = inputs.request_sent ? parseInt(inputs.request_sent) : null;
            let data_since_timestamp = inputs.data_since ? parseInt(inputs.data_since) : null;
            let prev_data_since = inputs.prev_data_since ? parseInt(inputs.prev_data_since) : null;
            let pagination_updated = inputs.pagination_updated ? parseInt(inputs.pagination_updated) : null;

            if (!request_sent) {
                return reject({
                    message: 'request timestamp required'
                });
            }

            let server_ms_diff = Math.max(0, timeNow() - request_sent);
            let add_data_since_ms = server_ms_diff + data_since_ms_extra;
            let data_since_timestamp_w_extra = null;

            if (data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            let networksLookup = await getNetworksLookup();

            let networks_persons_qry = conn('networks_persons AS np')
                .select(
                    'p.person_token',
                    'p.updated AS person_updated',
                    'p.registration_network_id',
                    'n.network_token',
                    'np.is_active',
                    'np.updated',
                    'np.deleted'
                )
                .join('persons AS p', 'np.person_id', '=', 'p.id')
                .join('networks AS n', 'np.network_id', '=', 'n.id')
                .orderBy('np.updated', 'desc')
                .limit(results_limit);

            if (timestamp_updated) {
                networks_persons_qry = networks_persons_qry.where('np.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                networks_persons_qry = networks_persons_qry.where('np.updated', '<=', pagination_updated);
            }

            let networks_persons = await networks_persons_qry;

            let organized = {};

            for(let row of networks_persons) {
                if(!(organized[row.person_token])) {
                    organized[row.person_token] = [];
                }

                let registration_network = networksLookup.byId[row.registration_network_id];
                let registration_network_token = registration_network?.network_token || null;

                organized[row.person_token].push({
                    registration_network_token,
                    person_token: row.person_token,
                    person_updated: row.person_updated - 1,
                    network_token: row.network_token,
                    is_active: row.is_active,
                    updated: row.updated,
                    deleted: row.deleted
                });
            }

            let lastTimestamps = [];

            if (networks_persons.length === results_limit) {
                lastTimestamps.push(networks_persons[networks_persons.length - 1].updated);
            }

            let return_pagination_updated = lastTimestamps.length ? Math.max(...lastTimestamps) : null;

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                networks_persons: organized
            });
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error syncing persons modes'
            });
        }
    });
}

function syncPersons (inputs) {
    return new Promise(async (resolve, reject) => {
        //returns persons on this network
        //recursive request process to support pagination and most recent data
        try {
            let conn = await dbService.conn();
            let my_network = await getNetworkSelf();

            //request_sent at
            //adjust timestamp to account for server time differences
            //return more data than requested
            //de-duplicate on request initiating side
            let request_sent = inputs.request_sent ? parseInt(inputs.request_sent) : null;

            //most recent data
            let data_since_timestamp = inputs.data_since ? parseInt(inputs.data_since) : null;
            let prev_data_since = inputs.prev_data_since ? parseInt(inputs.prev_data_since) : null;

            //pagination
            let last_person_token = inputs.last_person_token;

            if (!request_sent) {
                return reject({
                    message: 'request timestamp required'
                });
            }

            let server_ms_diff = Math.max(0, timeNow() - request_sent);
            let add_data_since_ms = server_ms_diff + data_since_ms_extra;
            let data_since_timestamp_w_extra = null;

            //results in reverse order
            let persons_qry = conn('persons AS p')
                .join('networks_persons AS np', 'np.person_id', '=', 'p.id')
                .where('np.network_id', my_network.id)
                .where('np.is_active', true)
                .orderBy('p.id', 'desc')
                .limit(results_limit)
                .select(
                    'person_token',
                    'grid_id', // converted to grid token
                    'modes',
                    'is_new',
                    'is_online',
                    'is_verified_in_person',
                    'is_verified_linkedin',
                    'gender_id', //converted to gender token
                    'timezone',
                    'reviews_count',
                    'rating_safety',
                    'rating_trust',
                    'rating_timeliness',
                    'rating_friendliness',
                    'rating_fun',
                    'age',
                    'is_blocked',
                    'p.updated',
                    'p.deleted',
                );

            if(data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            if(timestamp_updated) {
                persons_qry = persons_qry.where('p.updated', '>', timestamp_updated);
            }

            if (last_person_token) {
                //id from person token
                let person_token_qry = await conn('persons')
                    .where('person_token', last_person_token)
                    .first();

                if (person_token_qry) {
                    persons_qry = persons_qry.where('p.id', '<', person_token_qry.id);
                }
            }

            let persons = await persons_qry;
            let return_last_person_token = null;

            let gridLookup = await getGridLookup();

            let genders = await getGendersLookup();

            genders = structuredClone(genders);

            for(let k in genders.byId) {
                let g = genders.byId[k];
                delete g.id;
                delete g.created;
                delete g.updated;
            }

            //organize data
            for (let person of persons) {
                let grid = gridLookup.byId[person.grid_id];
                let gender = genders.byId[person.gender_id];

                delete person.gender_id;
                delete person.grid_id;

                if(grid) {
                    person.grid_token = grid.token;
                }

                if (gender) {
                    person.gender_token = gender.gender_token;
                }
            }

            //paginate if length of results equals query limit
            if (persons.length === results_limit) {
                //works in conjunction with person results in reverse order by id
                let last_person = persons[persons.length - 1];

                if (last_person) {
                    return_last_person_token = last_person.person_token;
                }
            }

            //first call: data_since_timestamp w/ extra,
            //second+ call: prev_data_since
            return resolve({
                last_person_token: return_last_person_token,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                persons: persons,
            });
        } catch (e) {
            return reject({
                message: 'Error syncing persons'
            });
        }
    });
}

function syncModes(inputs) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let my_network = await getNetworkSelf();

            let request_sent = inputs.request_sent ? parseInt(inputs.request_sent) : null;
            let data_since_timestamp = inputs.data_since ? parseInt(inputs.data_since) : null;
            let prev_data_since = inputs.prev_data_since ? parseInt(inputs.prev_data_since) : null;
            let pagination_updated = inputs.pagination_updated ? parseInt(inputs.pagination_updated) : null;

            if (!request_sent) {
                return reject({
                    message: 'request timestamp required'
                });
            }

            let server_ms_diff = Math.max(0, timeNow() - request_sent);
            let add_data_since_ms = server_ms_diff + data_since_ms_extra;
            let data_since_timestamp_w_extra = null;

            let partner_qry = conn('persons AS p')
                .select(
                    'p.person_token',
                    'p.modes',
                    'pp.token',
                    'pp.gender_id',
                    'pp.updated',
                    'pp.deleted'
                )
                .where('np.network_id', my_network.id)
                .join('networks_persons AS np', 'np.person_id', '=', 'p.id')
                .join('persons_partner AS pp', 'pp.person_id', '=', 'p.id')
                .orderBy('pp.updated', 'desc')
                .limit(results_limit);

            let kids_qry = conn('persons AS p')
                .select(
                    'p.person_token',
                    'p.modes',
                    'pk.token',
                    'pk.gender_id',
                    'pk.age_id',
                    'pk.is_active',
                    'pk.updated',
                    'pk.deleted',
                )
                .where('np.network_id', my_network.id)
                .join('networks_persons AS np', 'np.person_id', '=', 'p.id')
                .join('persons_kids AS pk', 'pk.person_id', '=', 'p.id')
                .orderBy('pk.updated', 'desc')
                .limit(results_limit);

            if (data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            if (timestamp_updated) {
                partner_qry = partner_qry.where('pp.updated', '>', timestamp_updated);
                kids_qry = kids_qry.where('pk.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                partner_qry = partner_qry.where('pp.updated', '<=', pagination_updated);
                kids_qry = kids_qry.where('pp.updated', '<=', pagination_updated);
            }

            let [partners, kids] = await Promise.all([
                partner_qry,
                kids_qry
            ]);

            let [genders, ages] = await Promise.all([
                getGendersLookup(),
                getKidsAgeLookup()
            ]);

            let persons_modes = {};

            for (let partner of partners) {
                if (!persons_modes[partner.person_token]) {
                    persons_modes[partner.person_token] = {
                        person_token: partner.person_token,
                        modes: JSON.parse(partner.modes || '[]'),
                        partner: null,
                        kids: {},
                    };
                }

                const gender = genders.byId[partner.gender_id];

                persons_modes[partner.person_token].partner = {
                    partner_token: partner.token,
                    gender_token: gender?.gender_token || null,
                    updated: partner.updated,
                    deleted: partner.deleted
                };
            }

            for (let kid of kids) {
                if (!persons_modes[kid.person_token]) {
                    persons_modes[kid.person_token] = {
                        person_token: kid.person_token,
                        modes: JSON.parse(kid.modes || '[]'),
                        partner: null,
                        kids: {},
                    };
                }

                const gender = genders.byId[kid.gender_id];
                const age = ages.byId[kid.age_id];

                persons_modes[kid.person_token].kids[kid.token] = {
                    token: kid.token,
                    gender_token: gender?.gender_token || null,
                    age_token: age?.token || null,
                    is_active: kid.is_active,
                    updated: kid.updated,
                    deleted: kid.deleted
                };
            }

            const results = Object.values(persons_modes);

            let lastTimestamps = [];

            if (partners.length === results_limit) {
                lastTimestamps.push(partners[partners.length - 1].updated);
            }
            if (kids.length === results_limit) {
                lastTimestamps.push(kids[kids.length - 1].updated);
            }

            let return_pagination_updated = lastTimestamps.length ? Math.max(...lastTimestamps) : null;

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                persons_modes: results
            });
        } catch (e) {
            console.error(e);

            return reject({
                message: 'Error syncing persons modes'
            });
        }
    });
}

module.exports = {
    createPerson,
    syncNetworksPersons,
    syncPersons,
    syncModes
};