const dbService = require('../db');
const { getNetworkSelf } = require('../network');
const { timeNow } = require('../shared');
const { results_limit, data_since_ms_extra } = require('./common');
const sectionsData = require('../sections_data');

let tables = [
    'persons_movies',
    'persons_movie_genres',
    'persons_tv_shows',
    'persons_tv_genres',
    'persons_sports_teams',
    'persons_sports_leagues',
    'persons_sports_play',
    'persons_music_artists',
    'persons_music_genres',
    'persons_instruments',
    'persons_schools',
    'persons_industries',
    'persons_roles',
    'persons_life_stages',
    'persons_relationship_status',
    'persons_languages',
    'persons_politics',
    'persons_religions',
    'persons_drinking',
    'persons_smoking'
];

function getTableRelations (table_name) {
    for(let k in sectionsData) {
        let sectionData = sectionsData[k];

        for(let t in sectionData.tables) {
            let tableData = sectionData.tables[t];

            if(tableData.user.name === table_name) {
                return {
                    section_key: k,
                    table_key: t,
                    is_favorable: tableData.isFavorable,
                    source_table: tableData.data.name,
                    col_id: tableData.user.cols.id,
                    col_secondary: tableData.user.cols.secondary || null,
                    has_hash_token: !!(sectionData.cacheKeys?.[t].byHashKey)
                }
            }
        }
    }
}


function syncMe (inputs) {
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

            let qryDict = {};

            if (data_since_timestamp) {
                data_since_timestamp_w_extra = data_since_timestamp - add_data_since_ms;
            }

            let timestamp_updated = prev_data_since || data_since_timestamp_w_extra;

            //query all sections
            for(let table of tables) {
                let tableData = getTableRelations(table);

                let select_cols = [
                    'p.id AS person_id',
                    'p.person_token',
                    'st.token',
                    't.updated',
                    't.deleted'
                ];

                if(tableData.is_favorable) {
                    select_cols.push('is_favorite', 'favorite_position');
                }

                if(tableData.col_secondary) {
                    select_cols.push(tableData.col_secondary);
                }

                if(tableData.has_hash_token) {
                    select_cols.push('hash_token');
                }

                qryDict[table] = conn('persons AS p')
                    .select(select_cols)
                    .where('np.network_id', my_network.id)
                    .where('np.is_active', true)
                    .join('networks_persons AS np', 'np.person_id', '=', 'p.id')
                    .join(`${table} AS t`, 't.person_id', '=', 'p.id')
                    .join(`${tableData.source_table} AS st`, `t.${tableData.col_id}`, '=', 'st.id')
                    .orderBy('t.updated', 'desc')
                    .limit(results_limit);

                if (timestamp_updated) {
                    qryDict[table] = qryDict[table].where('t.updated', '>', timestamp_updated);
                }

                if (pagination_updated) {
                    qryDict[table] = qryDict[table].where('t.updated', '<=', pagination_updated);
                }
            }

            qryDict.sections = conn('persons AS p')
                .select(
                    'p.id AS person_id',
                    'p.person_token',
                    'st.token',
                    't.position',
                    't.updated',
                    't.deleted'
                )
                .where('np.network_id', my_network.id)
                .where('np.is_active', true)
                .join('networks_persons AS np', 'np.person_id', '=', 'p.id')
                .join(`persons_sections AS t`, 't.person_id', '=', 'p.id')
                .join(`me_sections AS st`, `t.section_id`, '=', 'st.id')
                .orderBy('t.updated', 'desc')
                .limit(results_limit);

            if (timestamp_updated) {
                qryDict.sections = qryDict.sections.where('t.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                qryDict.sections = qryDict.sections.where('t.updated', '<=', pagination_updated);
            }

            for(let table in qryDict) {
                qryDict[table] = await qryDict[table]
            }

            //process/return data
            let persons = {};

            for(let table in qryDict) {
                let tableInfo = getTableRelations(table);

                let items = qryDict[table];

                for(let item of items) {
                    if (!persons[item.person_token]) {
                        persons[item.person_token] = {
                            person_token: item.person_token,
                            sections: {},
                            me: {}
                        };
                    }

                    if (table === 'sections') {
                        persons[item.person_token].sections[item.token] = {
                            token: item.token,
                            position: item.position,
                            updated: item.updated,
                            deleted: item.deleted
                        };
                    } else {
                        if (!persons[item.person_token].me[table]) {
                            persons[item.person_token].me[table] = {};
                        }

                        let itemData = {
                            token: item.token,
                            updated: item.updated,
                            deleted: item.deleted
                        }

                        if(tableInfo.is_favorable) {
                            itemData.is_favorite = item.is_favorite || null;
                            itemData.favorite_position = item.favorite_position || null;
                        }

                        if(tableInfo.col_secondary) {
                            itemData[tableInfo.col_secondary] = item[tableInfo.col_secondary];
                        }

                        if(tableInfo.has_hash_token) {
                            itemData.hash_token = item.hash_token;
                        }

                        persons[item.person_token].me[table][item.token] = itemData;
                    }
                }
            }

            // Calculate next pagination cursor
            const lastTimestamps = [];

            for(let table in qryDict) {
                const tableResults = qryDict[table];

                if (tableResults.length === results_limit) {
                    lastTimestamps.push(tableResults[tableResults.length - 1].updated);
                }
            }

            let return_pagination_updated = lastTimestamps.length ? Math.max(...lastTimestamps) : null;

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                persons: Object.values(persons)
            });
        } catch (e) {
            console.error('Error syncing me:', e);

            return reject({
                message: 'Error syncing me'
            });
        }
    });
}

module.exports = {
    tables,
    syncMe,
}