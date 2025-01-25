const dbService = require('../db');
const { getNetworkSelf, getNetworksLookup } = require('../network');
const { timeNow } = require('../shared');
const { results_limit, data_since_ms_extra } = require('./common');
const { filterMappings} = require('../../services/filters');
const { getFilters } = require('../filters');

function getFilterMapByItem(item) {
    for(let k in item) {
        if(['person_id', 'filter_id'].includes(k)) {
            continue;
        }

        let v = item[k];

        if(k.endsWith('_id') && v) {
            for(let f in filterMappings) {
                if(k === filterMappings[f].column) {
                    return filterMappings[f];
                }
            }
        }
    }

    return null;
}

function getFilterMapByTable(table) {
    for(let f in filterMappings) {
        if(table === filterMappings[f].table) {
            return filterMappings[f];
        }
    }

    return null;
}


function syncFilters (inputs) {
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

            if (data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            let filters_qry = conn('persons AS p')
                .select(
                    'p.id AS person_id',
                    'p.person_token',
                    'pf.*'
                )
                .where('p.network_id', my_network.id)
                .join('persons_filters AS pf', 'pf.person_id', '=', 'p.id')
                .orderBy('pf.updated', 'desc')
                .limit(results_limit);

            let availability_qry = conn('persons AS p')
                .select(
                    'p.id AS person_id',
                    'p.person_token',
                    'pa.token',
                    'pa.day_of_week',
                    'pa.is_day',
                    'pa.is_time',
                    'pa.start_time',
                    'pa.end_time',
                    'pa.is_overnight',
                    'pa.is_any_time',
                    'pa.is_active',
                    'pa.updated',
                    'pa.deleted',
                )
                .where('p.network_id', my_network.id)
                .join('persons_availability AS pa', 'pa.person_id', '=', 'p.id')
                .orderBy('pa.updated', 'desc')
                .limit(results_limit);

            let networks_qry = conn('persons AS p')
                .select(
                    'p.id AS person_id',
                    'p.person_token',
                    'pfn.token',
                    'pfn.network_id',
                    'pfn.is_all_verified',
                    'pfn.is_any_network',
                    'pfn.is_active',
                    'pfn.updated',
                    'pfn.deleted',
                )
                .where('p.network_id', my_network.id)
                .join('persons_filters_networks AS pfn', 'pfn.person_id', '=', 'p.id')
                .orderBy('pfn.updated', 'desc')
                .limit(results_limit);

            if (timestamp_updated) {
                filters_qry = filters_qry.where('pf.updated', '>', timestamp_updated);
                availability_qry = availability_qry.where('pa.updated', '>', timestamp_updated);
                networks_qry = networks_qry.where('pfn.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                filters_qry = filters_qry.where('pf.updated', '<=', pagination_updated);
                availability_qry = availability_qry.where('pa.updated', '<=', pagination_updated);
                networks_qry = networks_qry.where('pfn.updated', '<=', pagination_updated);
            }

            filters_qry = await filters_qry;
            availability_qry = await availability_qry;
            networks_qry = await networks_qry;

            //organize lookups
            let filtersLookup = await getFilters();
            let networksLookup = await getNetworksLookup();
            let tablesLookup = {};
            let tablesIds = {};

            //loop through all filters and find cols with ids and their respective tables
            for(let item of filters_qry) {
                let filterMapping = getFilterMapByItem(item);

                if(filterMapping) {
                    if(!(filterMapping.table in tablesIds)) {
                        tablesIds[filterMapping.table] = {};
                    }

                    //id of item on dynamic table
                    tablesIds[filterMapping.table][item[filterMapping.column]] = true;
                }
            }

            for(let table in tablesIds) {
                let filterMapping = getFilterMapByTable(table);

                let token_col = 'token';

                if(filterMapping?.column_token) {
                    token_col = `${filterMapping.column_token} AS token`;
                }

                let qry = await conn(table)
                    .whereIn('id', Object.keys(tablesIds[table]))
                    .select('id', token_col);

                tablesLookup[table] = {};

                for(let item of qry) {
                    tablesLookup[table][item.id] = item.token;
                }
            }

            //organize return object
            let persons_filters = {};

            let filters_data = [
                {
                    name: 'filters',
                    results: filters_qry
                },
                {
                    name: 'availability',
                    results: availability_qry
                },
                {
                    name: 'networks',
                    results: networks_qry
                }
            ];

            for(let data of filters_data) {
                let persons_data = persons_filters[data.name] = {};

                for(let item of data.results) {
                    //add filter token
                    if(item.filter_id) {
                        item.filter_token = filtersLookup.byId[item.filter_id].token;
                    }

                    //add item token
                    let filterMapping = getFilterMapByItem(item);

                    if(filterMapping?.column) {
                        item.item_token = tablesLookup[filterMapping.table][item[filterMapping.column]] || null;
                    }

                    let person_token = item.person_token;

                    if(!persons_data[person_token]) {
                        persons_data[person_token] = {};
                    }

                    persons_data[person_token][item.token] = item;

                    //delete unneeded cols
                    delete item.id;
                    delete item.created;

                    for(let k in item) {
                        if(k.includes('_id')) {
                            delete item[k];
                        }
                    }
                }
            }

            const lastTimestamps = [];

            for(let data of filters_data) {
                let results = data.results;

                if (results.length === results_limit) {
                    lastTimestamps.push(results[results.length - 1].updated);
                }
            }

            let return_pagination_updated = lastTimestamps.length ? Math.max(...lastTimestamps) : null;

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                filters: persons_filters
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