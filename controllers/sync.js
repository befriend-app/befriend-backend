const dbService = require('../services/db');
const { getNetworkSelf } = require('../services/network');
const { timeNow, isNumeric } = require('../services/shared');
const { getGendersLookup } = require('../services/genders');
const { getGridLookup } = require('../services/grid');
const { getKidsAgeLookup } = require('../services/modes');

module.exports = {
    limit: 10000,
    data_since_ms_extra: 1000,
    syncPersons: function (req, res) {
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
                let request_sent = req.query.request_sent ? parseInt(req.query.request_sent) : null;

                //most recent data
                let data_since_timestamp = req.query.data_since ? parseInt(req.query.data_since) : null;
                let prev_data_since = req.query.prev_data_since ? parseInt(req.query.prev_data_since) : null;

                //pagination
                let last_person_token = req.query.last_person_token;

                if (!request_sent) {
                    res.json('request timestamp required', 400);
                    return resolve();
                }

                let server_ms_diff = Math.max(0, timeNow() - request_sent);
                let add_data_since_ms = server_ms_diff + module.exports.data_since_ms_extra;
                let data_since_timestamp_w_extra = null;

                //results in reverse order
                let persons_qry = conn('persons')
                    .where('network_id', my_network.id) //my network's persons
                    .orderBy('id', 'desc')
                    .limit(module.exports.limit)
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
                        'updated',
                        'deleted',
                    );
                
                if(data_since_timestamp) {
                    data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
                }

                let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;
                
                if(timestamp_updated) {
                    persons_qry = persons_qry.where('updated', '>', timestamp_updated);
                }

                if (last_person_token) {
                    //id from person token
                    let person_token_qry = await conn('persons')
                        .where('person_token', last_person_token)
                        .first();

                    if (person_token_qry) {
                        persons_qry = persons_qry.where('id', '<', person_token_qry.id);
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
                if (persons.length === module.exports.limit) {
                    //works in conjunction with person results in reverse order by id
                    let last_person = persons[persons.length - 1];

                    if (last_person) {
                        return_last_person_token = last_person.person_token;
                    }
                }

                //first call: data_since_timestamp w/ extra,
                //second+ call: prev_data_since
                res.json(
                    {
                        last_person_token: return_last_person_token,
                        prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                        persons: persons,
                    },
                    202,
                );
            } catch (e) {
                res.json('Error syncing persons', 400);
            }

            resolve();
        });
    },
    syncPersonsModes: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();
                let my_network = await getNetworkSelf();

                let request_sent = req.query.request_sent ? parseInt(req.query.request_sent) : null;
                let data_since_timestamp = req.query.data_since ? parseInt(req.query.data_since) : null;
                let prev_data_since = req.query.prev_data_since ? parseInt(req.query.prev_data_since) : null;
                let last_person_token = req.query.last_person_token;

                if (!request_sent) {
                    res.json('request timestamp required', 400);
                    return resolve();
                }

                let server_ms_diff = Math.max(0, timeNow() - request_sent);
                let add_data_since_ms = server_ms_diff + module.exports.data_since_ms_extra;
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
                    .where('p.network_id', my_network.id)
                    .join('persons_partner AS pp', 'pp.person_id', '=', 'p.id')
                    .orderBy('p.id', 'desc')
                    .limit(module.exports.limit);

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
                    .where('p.network_id', my_network.id)
                    .join('persons_kids AS pk', 'pk.person_id', '=', 'p.id')
                    .orderBy('p.id', 'desc')
                    .limit(module.exports.limit);

                if (data_since_timestamp) {
                    data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
                }

                let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

                if (timestamp_updated) {
                    partner_qry = partner_qry.where('pp.updated', '>', timestamp_updated);
                    kids_qry = kids_qry.where('pk.updated', '>', timestamp_updated);
                }

                if (last_person_token) {
                    const person_token_qry = await conn('persons')
                        .where('person_token', last_person_token)
                        .first();

                    if (person_token_qry) {
                        partner_qry = partner_qry.where('p.id', '<', person_token_qry.id);
                        kids_qry = kids_qry.where('p.id', '<', person_token_qry.id);
                    }
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
                let return_last_person_token = null;

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

                if (results.length === module.exports.limit) {
                    const last_person = results[results.length - 1];

                    if (last_person) {
                        return_last_person_token = last_person.person_token;
                    }
                }

                res.json({
                    last_person_token: return_last_person_token,
                    prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                    persons_modes: results
                }, 202);
            } catch (e) {
                console.error('Error syncing persons modes:', e);
                res.json('Error syncing persons modes', 400);
            }

            resolve();
        });
    },
    syncMe: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                let conn = await dbService.conn();
                let my_network = await getNetworkSelf();

                let request_sent = req.query.request_sent ? parseInt(req.query.request_sent) : null;
                let data_since_timestamp = req.query.data_since ? parseInt(req.query.data_since) : null;
                let prev_data_since = req.query.prev_data_since ? parseInt(req.query.prev_data_since) : null;
                let last_person_token = req.query.last_person_token;

                if (!request_sent) {
                    res.json('request timestamp required', 400);
                    return resolve();
                }

                let server_ms_diff = Math.max(0, timeNow() - request_sent);
                let add_data_since_ms = server_ms_diff + module.exports.data_since_ms_extra;
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
                    .where('p.network_id', my_network.id)
                    .join('persons_partner AS pp', 'pp.person_id', '=', 'p.id')
                    .orderBy('p.id', 'desc')
                    .limit(module.exports.limit);

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
                    .where('p.network_id', my_network.id)
                    .join('persons_kids AS pk', 'pk.person_id', '=', 'p.id')
                    .orderBy('p.id', 'desc')
                    .limit(module.exports.limit);

                if (data_since_timestamp) {
                    data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
                }

                let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

                if (timestamp_updated) {
                    partner_qry = partner_qry.where('pp.updated', '>', timestamp_updated);
                    kids_qry = kids_qry.where('pk.updated', '>', timestamp_updated);
                }

                if (last_person_token) {
                    const person_token_qry = await conn('persons')
                        .where('person_token', last_person_token)
                        .first();

                    if (person_token_qry) {
                        partner_qry = partner_qry.where('p.id', '<', person_token_qry.id);
                        kids_qry = kids_qry.where('p.id', '<', person_token_qry.id);
                    }
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
                let return_last_person_token = null;

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

                if (results.length === module.exports.limit) {
                    const last_person = results[results.length - 1];

                    if (last_person) {
                        return_last_person_token = last_person.person_token;
                    }
                }

                res.json({
                    last_person_token: return_last_person_token,
                    prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                    persons_modes: results
                }, 202);
            } catch (e) {
                console.error('Error syncing persons modes:', e);
                res.json('Error syncing persons modes', 400);
            }

            resolve();
        });
    }
};
