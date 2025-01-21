const dbService = require('../db');
const { getNetworkSelf } = require('../network');
const { timeNow } = require('../shared');
const { results_limit, data_since_ms_extra } = require('./common');
const { filterMappings} = require('../../services/filters');

function syncFilters (req, res) {
    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();
            let my_network = await getNetworkSelf();

            let request_sent = req.query.request_sent ? parseInt(req.query.request_sent) : null;
            let data_since_timestamp = req.query.data_since ? parseInt(req.query.data_since) : null;
            let prev_data_since = req.query.prev_data_since ? parseInt(req.query.prev_data_since) : null;
            let pagination_updated = req.query.pagination_updated ? parseInt(req.query.pagination_updated) : null;

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

            // Query all filter tables
            let qryDict = {};

            // Process filters table and data
            for(let filter_key in filterMappings) {
                let mapping = filterMappings[filter_key];

                // Skip sub-filters as they're handled by parent
                if (mapping.is_sub) {
                    continue;
                }

                qryDict[filter_key] = conn('persons AS p')
                    .select(
                        'p.id AS person_id',
                        'p.person_token',
                        'pf.id',
                        'pf.filter_id',
                        'pf.is_send',
                        'pf.is_receive',
                        'pf.is_active',
                        'pf.is_negative',
                        'pf.filter_value',
                        'pf.filter_value_min',
                        'pf.filter_value_max',
                        'pf.importance',
                        'pf.secondary_level',
                        'pf.updated',
                        'pf.deleted'
                    )
                    .where('p.network_id', my_network.id)
                    .join('persons_filters AS pf', 'pf.person_id', '=', 'p.id')
                    .whereIn('pf.filter_id', function() {
                        this.select('id')
                            .from('filters')
                            .where('token', filter_key);
                    })
                    .orderBy('pf.updated', 'desc')
                    .limit(results_limit);

                if (timestamp_updated) {
                    qryDict[filter_key] = qryDict[filter_key].where('pf.updated', '>', timestamp_updated);
                }

                if (pagination_updated) {
                    qryDict[filter_key] = qryDict[filter_key].where('pf.updated', '<=', pagination_updated);
                }
            }

            // Execute all queries
            for(let filter_key in qryDict) {
                qryDict[filter_key] = await qryDict[filter_key];
            }

            // Process results into organized format
            let persons = {};

            for(let filter_key in qryDict) {
                let items = qryDict[filter_key];

                for(let item of items) {
                    if (!persons[item.person_token]) {
                        persons[item.person_token] = {
                            person_token: item.person_token,
                            filters: {}
                        };
                    }

                    let filterData = {
                        id: item.id,
                        filter_id: item.filter_id,
                        is_send: item.is_send,
                        is_receive: item.is_receive,
                        is_active: item.is_active,
                        is_negative: item.is_negative,
                        updated: item.updated,
                        deleted: item.deleted
                    };

                    // Add optional fields if present
                    if (item.filter_value !== null) filterData.filter_value = item.filter_value;
                    if (item.filter_value_min !== null) filterData.filter_value_min = item.filter_value_min;
                    if (item.filter_value_max !== null) filterData.filter_value_max = item.filter_value_max;
                    if (item.importance !== null) filterData.importance = item.importance;
                    if (item.secondary_level !== null) {
                        try {
                            filterData.secondary_level = JSON.parse(item.secondary_level);
                        } catch(e) {
                            filterData.secondary_level = item.secondary_level;
                        }
                    }

                    persons[item.person_token].filters[filter_key] = filterData;
                }
            }

            // Calculate next pagination cursor
            const lastTimestamps = [];

            for(let filter_key in qryDict) {
                const filterResults = qryDict[filter_key];

                if (filterResults.length === results_limit) {
                    lastTimestamps.push(filterResults[filterResults.length - 1].updated);
                }
            }

            let return_pagination_updated = lastTimestamps.length ? Math.max(...lastTimestamps) : null;

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                persons: Object.values(persons)
            });
        } catch (e) {
            console.error('Error syncing persons filters:', e);

            return reject({
                message: 'Error syncing persons filters'
            });
        }
    });
}

module.exports = {
    syncFilters
}