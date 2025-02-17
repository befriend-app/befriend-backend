const dbService = require('../db');
const { getNetworkSelf } = require('../network');
const { timeNow } = require('../shared');
const { results_limit, data_since_ms_extra } = require('./common');


function syncActivities(from_network, inputs) {
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

            //provide data for activities created on my network that include the requesting network's persons
            let qry = conn('activities AS a')
                .join('activities_notifications AS an', 'an.activity_id', '=', 'a.id')
                .select(
                    'an.person_to_id AS person_id',
                    'a.activity_token',
                    'a.is_fulfilled',
                    'a.updated'
                )
                .where('a.network_id', my_network.id)
                .where('an.person_to_network_id', from_network.id)
                .orderBy('a.updated', 'desc')
                .limit(results_limit);

            if (timestamp_updated) {
                qry = qry.where('a.updated', '>', timestamp_updated);
            }

            if (pagination_updated) {
                qry = qry.where('a.updated', '<=', pagination_updated);
            }

            let activities = await qry;

            // //organize/get/append person token
            // let personIds = new Set();
            // let personIdTokenMap = {};
            //
            // for(let a of activities) {
            //     personIds.add(a.person_id);
            // }
            //
            // try {
            //     let personsQry = await conn('persons')
            //         .whereIn('id', Array.from(personIds))
            //         .select('id', 'person_token');
            //
            //     for(let p of personsQry) {
            //         personIdTokenMap[p.id] = p.person_token;
            //     }
            // } catch(e) {
            //     console.error(e);
            // }

            let duplicateCheck = {};
            let formattedActivities = [];

            for(let activity of activities) {
                if(activity.activity_token in duplicateCheck) {
                    continue;
                }

                formattedActivities.push({
                    // person_token: personIdTokenMap[activity.person_id],
                    activity_token: activity.activity_token,
                    is_fulfilled: activity.is_fulfilled,
                    updated: activity.updated
                });

                duplicateCheck[activity.activity_token] = true;
            }

            let return_pagination_updated = null;

            if (activities.length === results_limit) {
                return_pagination_updated = activities[activities.length - 1].updated;
            }

            return resolve({
                pagination_updated: return_pagination_updated,
                prev_data_since: prev_data_since || data_since_timestamp_w_extra,
                activities: formattedActivities
            });
        } catch (e) {
            console.error('Error syncing activities:', e);

            return reject({
                message: 'Error syncing activities'
            });
        }
    });
}

module.exports = {
    syncActivities
};