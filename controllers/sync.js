const dbService = require('../services/db');
const { getNetworkSelf } = require('../services/network');
const { timeNow } = require('../services/shared');
const { getGendersLookup } = require('../services/genders');

module.exports = {
    limit: 10000,
    data_since_ms_extra: 1000,
    syncPersons: function (req, res) {
        return new Promise(async (resolve, reject) => {
            //returns persons on this network
            //recursive request process to support pagination and most recent data
            try {
                let add_data_since_ms,
                    data_since_timestamp,
                    conn,
                    from_network,
                    last_person_token,
                    my_network,
                    person_token_qry,
                    persons,
                    persons_qry,
                    request_sent,
                    server_ms_diff,
                    data_since_timestamp_w_extra = null,
                    prev_data_since = null,
                    return_last_person_token = null;

                conn = await dbService.conn();

                my_network = await getNetworkSelf();

                //request_sent at
                //adjust timestamp to account for server time differences
                //return more data than requested
                //de-duplicate on request initiating side
                request_sent = req.body.request_sent;

                if (!request_sent) {
                    res.json('request timestamp required', 400);
                    return resolve();
                }

                server_ms_diff = timeNow() - request_sent;

                if (server_ms_diff < 0) {
                    server_ms_diff = 0;
                }

                add_data_since_ms = server_ms_diff + module.exports.data_since_ms_extra;

                //for most recent data
                data_since_timestamp = req.body.data_since;
                prev_data_since = req.body.prev_data_since;

                //for pagination
                last_person_token = req.body.last_person_token;

                //results in reverse order
                persons_qry = conn('persons')
                    .where('network_id', my_network.id) //my network's persons
                    .orderBy('id', 'desc')
                    .limit(module.exports.limit)
                    .select(
                        'person_token',
                        'mode',
                        'is_verified_in_person',
                        'is_verified_linkedin',
                        'is_online',
                        'gender_id', //converted to gender obj with token
                        'reviews_count',
                        'reviews_rating',
                        'age',
                        'birth_date', //todo convert to age
                        'is_blocked',
                        'updated',
                        'deleted',
                    );

                if (prev_data_since) {
                    persons_qry = persons_qry.where('updated', '>', prev_data_since);
                } else if (data_since_timestamp) {
                    data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
                    persons_qry = persons_qry.where('updated', '>', data_since_timestamp_w_extra);
                }

                if (last_person_token) {
                    //id from person token
                    person_token_qry = await conn('persons')
                        .where('person_token', last_person_token)
                        .first();

                    if (person_token_qry) {
                        persons_qry = persons_qry.where('id', '<', person_token_qry.id);
                    }
                }

                persons = await persons_qry;

                let genders = await getGendersLookup();

                //organize data
                for (let person of persons) {
                    let gender = genders.byId[person.gender_id];

                    delete person.gender_id;

                    if (gender) {
                        person.gender = gender;
                        delete gender.id;
                        delete gender.created;
                        delete gender.updated;
                    }
                }

                //paginate if length of results equals query limit
                if (persons.length === module.exports.limit) {
                    let last_person = persons[persons.length - 1];

                    if (last_person) {
                        return_last_person_token = last_person.person_token;
                    }
                }

                //first call: data_since_timestamp, second+ call: prev_data_since
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
};
