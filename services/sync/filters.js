const dbService = require('../db');
const { getNetworkSelf } = require('../network');
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
            let tablesLookup = {};
            let tablesIds = {};

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
            let persons = {};

            //1st loop - parent structure
            for(let item of filters_qry) {
                let person_filters = persons[item.person_token];

                if (!person_filters) {
                    person_filters = persons[item.person_token] = {
                        person_token: item.person_token,
                        filters: {}
                    };
                }

                let filter = filtersLookup.byId[item.filter_id];

                let filterMapping = getFilterMapByItem(item);

                if(filterMapping?.column) {
                    let filterItem = tablesLookup[filterMapping.table][item[filterMapping.column]];

                    if(filterItem) {
                        continue;
                    }
                }

                if(!(person_filters.filters[filter.token])) {
                    person_filters.filters[filter.token] = {};
                }

                person_filters.filters[filter.token] = {
                    filter_token: filter.token,
                    is_send: item.is_send,
                    is_receive: item.is_receive,
                    is_active: item.is_active,
                    updated: item.updated,
                    deleted: item.deleted,
                    items: {}
                };
            }

            //2nd loop - items structure
            for(let item of filters_qry) {
                let person_filters = persons[item.person_token];

                if (!person_filters) {
                    person_filters = persons[item.person_token] = {
                        person_token: item.person_token,
                        filters: {}
                    };
                }

                let filter = filtersLookup.byId[item.filter_id];

                if(!(person_filters.filters[filter.token])) {
                    person_filters.filters[filter.token] = {
                        filter_token: filter.token,
                        is_send: item.is_send,
                        is_receive: item.is_receive,
                        is_active: item.is_active,
                        updated: item.updated,
                        deleted: item.deleted,
                        items: {}
                    }
                }

                let filterMapping = getFilterMapByItem(item);

                if(filterMapping?.column) {
                    let itemToken = tablesLookup[filterMapping.table][item[filterMapping.column]];

                    if(!itemToken) {
                        continue;
                    }

                    let filterData = {
                        token: itemToken,
                        is_negative: item.is_negative,
                        is_active: item.is_active,
                        is_send: item.is_send,
                        is_receive: item.is_receive,
                        updated: item.updated,
                        deleted: item.deleted,
                    };

                    if (item.filter_value !== null) {
                        filterData.filter_value = item.filter_value;
                    }

                    if (item.filter_value_min !== null) {
                        filterData.filter_value_min = item.filter_value_min;
                    }

                    if (item.filter_value_max !== null) {
                        filterData.filter_value_max = item.filter_value_max;
                    }

                    if (item.importance !== null) {
                        filterData.importance = item.importance;
                    }

                    if (item.secondary_level !== null) {
                        try {
                            filterData.secondary_level = JSON.parse(item.secondary_level);
                        } catch(e) {
                            filterData.secondary_level = item.secondary_level;
                        }
                    }

                    person_filters.filters[filter.token].items[itemToken] = filterData;
                }
            }

            // Add availability data to persons structure
            for(let item of availability_qry) {
                let person_filters = persons[item.person_token];

                if (!person_filters) {
                    person_filters = persons[item.person_token] = {
                        person_token: item.person_token,
                        filters: {}
                    };
                }

                if (!person_filters.filters['availability']) {
                    person_filters.filters['availability'] = {
                        filter_token: 'availability',
                        is_active: true,
                        updated: item.updated,
                        deleted: item.deleted,
                        items: {}
                    };
                }

                //availability
                person_filters.filters['availability'].items[item.token] = {
                    token: item.token,
                    day_of_week: item.day_of_week,
                    is_day: item.is_day,
                    is_time: item.is_time,
                    start_time: item.start_time,
                    end_time: item.end_time,
                    is_overnight: item.is_overnight,
                    is_any_time: item.is_any_time,
                    is_active: item.is_active,
                    updated: item.updated,
                    deleted: item.deleted
                };
            }

            const lastTimestamps = [];

            let filters_data = [filters_qry, availability_qry, networks_qry];

            for(let results of filters_data) {
                if (results.length === results_limit) {
                    lastTimestamps.push(results[results.length - 1].updated);
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