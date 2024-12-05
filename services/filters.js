const cacheService = require('./cache');
const dbService = require('./db');

function getFilters() {
    return new Promise(async (resolve, reject) => {
        if(module.exports.filters) {
            return resolve(module.exports.filters);
        }

        let cache_key = cacheService.keys.filters;

        try {
            let cache_data = await cacheService.getObj(cache_key);

            if(cache_data) {
                module.exports.filters = cache_data;
                return resolve(cache_data);
            }

            let conn = await dbService.conn();

            let filters = await conn('filters')
                .whereNull('deleted');

            let filters_dict = filters.reduce((acc, filter) => {
                acc.byId[filter.id] = filter;
                acc.byToken[filter.token] = filter;
                return acc;
            }, {byId: {}, byToken: {}});

            module.exports.filters = filters_dict;

            await cacheService.setCache(cache_key, filters_dict)

            resolve(filters_dict);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

function getPersonFilters(person) {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.person_filters(person.person_token);

        try {
            let person_filters = await cacheService.getObj(cache_key);

            if(person_filters) {
                return resolve(person_filters);
            }

            let filters = await module.exports.getFilters();

            let conn = await dbService.conn();

            let qry = await conn('persons_filters')
                .where('person_id', person.id);

            person_filters = {};

            let groupedRows = {};
            for (let row of qry) {
                let filter = filters.byId[row.filter_id];
                if (!filter) continue;

                if (!groupedRows[filter.token]) {
                    groupedRows[filter.token] = [];
                }
                groupedRows[filter.token].push(row);
            }

            for (let filter_token in groupedRows) {
                const rows = groupedRows[filter_token];
                const mapping = filterMappings[filter_token];
                if (!mapping) continue;

                // Get first row for base properties
                const baseRow = rows[0];

                // Create base filter entry
                let filterEntry = {
                    id: baseRow.id,
                    filter_id: baseRow.filter_id,
                    is_send: baseRow.is_send,
                    is_receive: baseRow.is_receive,
                    is_active: baseRow.is_active,
                    created: baseRow.created,
                    updated: baseRow.updated
                };

                // Handle single vs multi filters differently
                if (mapping.multi) {
                    // Initialize multi filter with base properties and empty items
                    person_filters[filter_token] = {
                        ...filterEntry,
                        items: {}
                    };

                    // Process each row as an item
                    for (let row of rows) {
                        let itemEntry = {
                            id: row.id,
                            created: row.created,
                            updated: row.updated
                        };

                        // Add column-specific values
                        if (mapping.column && row[mapping.column]) {
                            itemEntry[mapping.token] = row[mapping.column];
                        }

                        // Add any filter values
                        if (row.filter_value !== null) {
                            itemEntry.filter_value = row.filter_value;
                        }
                        if (row.filter_value_min !== null) {
                            itemEntry.filter_value_min = row.filter_value_min;
                        }
                        if (row.filter_value_max !== null) {
                            itemEntry.filter_value_max = row.filter_value_max;
                        }
                        if (row.secondary_level !== null) {
                            itemEntry.secondary_level = row.secondary_level;
                        }

                        person_filters[filter_token].items[row.id] = itemEntry;
                    }
                } else {
                    if (baseRow.filter_value !== null) {
                        filterEntry.filter_value = baseRow.filter_value;
                    }
                    if (baseRow.filter_value_min !== null) {
                        filterEntry.filter_value_min = baseRow.filter_value_min;
                    }
                    if (baseRow.filter_value_max !== null) {
                        filterEntry.filter_value_max = baseRow.filter_value_max;
                    }
                    if (baseRow.secondary_level !== null) {
                        filterEntry.secondary_level = baseRow.secondary_level;
                    }

                    person_filters[filter_token] = filterEntry;
                }
            }

            //set cache if missed above
            await cacheService.setCache(cache_key, person_filters);
            resolve(person_filters);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    getFilters,
    getPersonFilters
}