//this sync process sends reviews created on 3rd party network to befriend home network

const axios = require('axios');

const cacheService = require('../../../services/cache');
const dbService = require('../../../services/db');
const { timeNow, loadScriptEnv, timeoutAwait, getURL, joinPaths } = require('../../../services/shared');
const {
    getNetworkSelf,
    homeDomains,
    getNetworkWithSecretKeyByDomain,
} = require('../../../services/network');
const { keys: systemKeys, getNetworkSyncProcess, setNetworkSyncProcess } = require('../../../system');
const { getReviewsLookup } = require('../../../services/reviews');
const { getModes } = require('../../../services/modes');
const { getActivityType } = require('../../../services/activities');
const { batchQuantity, defaultTimeout } = require('../../common');

loadScriptEnv();

let debug_sync_enabled = require('../../../dev/debug').sync.reviews;

let networkSelf;

function syncReviews() {
    console.log("Sync: reviews");

    const sync_name = systemKeys.sync.network.reviews;

    return new Promise(async (resolve, reject) => {
        try {
            let conn = await dbService.conn();

            let domains = await homeDomains();
            let modesLookup = await getModes();
            let reviewsLookup = await getReviewsLookup();

            for (let domain of domains) {
                try {
                    let network = await getNetworkWithSecretKeyByDomain(domain);

                    if (!network) {
                        continue;
                    }

                    let hasMore = true;
                    let lastId = null;

                    let skipSaveTimestamps = false;

                    let timestamps = {
                        current: timeNow(),
                        last: null,
                    };

                    let last_sync = await getNetworkSyncProcess(sync_name, network.network.id);

                    if (last_sync && !debug_sync_enabled) {
                        timestamps.last = last_sync.last_updated;
                    }

                    while (hasMore) {
                        let reviews_qry = await conn('activities_persons_reviews')
                            .where('id', '>', lastId || 0)
                            .where(function() {
                                this.where('is_synced', 0)
                                    .orWhere('updated', '>', timestamps.last || 0);
                            })
                            .limit(batchQuantity);

                        if(reviews_qry.length === batchQuantity) {
                            lastId = reviews_qry[reviews_qry.length - 1].id;
                        } else {
                            hasMore = false;
                        }

                        //prepare/organize
                        let activityIds = new Set();
                        let filteredActivityIds = [];
                        let personIds = new Set();

                        for(let r of reviews_qry) {
                            activityIds.add(r.activity_id);
                            personIds.add(r.person_from_id);
                            personIds.add(r.person_to_id);
                        }

                        //get data
                        //only process from originating network of activity
                        let activities_qry = await conn('activities')
                            .whereIn('id', Array.from(activityIds))
                            .where('network_id', networkSelf.id);

                        for(let a of activities_qry) {
                            filteredActivityIds.push(a.id);
                            personIds.add(a.person_id);
                        }

                        let activities_persons_qry = await conn('activities_persons')
                            .whereIn('activity_id', Array.from(filteredActivityIds))
                            .whereIn('person_id', Array.from(personIds));

                        let persons_qry = await conn('persons')
                            .whereIn('id', Array.from(personIds))
                            .select('id', 'person_token');

                        //lookups
                        let personsLookup = {};
                        let activitiesLookup = {};
                        let activitiesPersonsLookup = {};
                        let activitiesReviewsLookup = {};

                        for(let person of persons_qry) {
                            personsLookup[person.id] = person;
                        }

                        for(let activity of activities_qry) {
                            activitiesLookup[activity.id] = activity;
                        }

                        for(let ap of activities_persons_qry) {
                            if(!activitiesPersonsLookup[ap.activity_id]) {
                                activitiesPersonsLookup[ap.activity_id] = {};
                            }

                            activitiesPersonsLookup[ap.activity_id][ap.person_id] = ap;
                        }

                        for(let review of reviews_qry) {
                            if(!activitiesReviewsLookup[review.activity_id]) {
                                activitiesReviewsLookup[review.activity_id] = {};
                            }

                            activitiesReviewsLookup[review.activity_id][review.id] = review;
                        }

                        //organize
                        let activitiesOrganized = {};

                        for(let activity of activities_qry) {
                            let personsOrganized = {}, reviews = [];

                            let activity_id = activity.id;
                            let activity_token = activity.activity_token;

                            //organize activity
                            delete activity.id;
                            delete activity.network_id;

                            let activityType = await getActivityType(null, activity.activity_type_id);
                            activity.activity_type_token = activityType.activity_type_token;
                            delete activity.activity_type_id;

                            activity.person_token = personsLookup[activity.person_id].person_token;
                            delete activity.person_id;

                            activity.mode_token = modesLookup.byId[activity.mode_id].token;
                            delete activity.mode_id;

                            //organize activity->persons
                            let activityPersons = activitiesPersonsLookup[activity_id];

                            for(let person_id in activityPersons) {
                                let data = activityPersons[person_id];
                                let person_token = personsLookup[person_id]?.person_token;

                                if(!person_token) {
                                    console.warn('Person token not found');
                                    continue;
                                }

                                personsOrganized[person_token] = {
                                    is_creator: data.is_creator,
                                    accepted_at: data.accepted_at,
                                    arrived_at: data.arrived_at,
                                    cancelled_at: data.cancelled_at,
                                    left_at: data.left_at,
                                    updated: data.updated
                                }
                            }

                            //organize activity->reviews
                            let activityReviews = activitiesReviewsLookup[activity_id];

                            for(let id in activityReviews) {
                                let data = activityReviews[id];
                                let person_from_token = personsLookup[data.person_from_id]?.person_token;
                                let person_to_token = personsLookup[data.person_to_id]?.person_token;

                                if(!person_from_token || !person_to_token) {
                                    console.warn('Person from/to not found');
                                    continue;
                                }

                                let review_token = reviewsLookup.byId[data.review_id]?.token || null;

                                reviews.push({
                                    id: id,
                                    person_from_token,
                                    person_to_token,
                                    activity_token,
                                    no_show: data.no_show,
                                    review_token,
                                    rating: data.rating,
                                    updated: data.updated,
                                    deleted: data.deleted
                                });
                            }

                            let reviewsCopy = structuredClone(reviews);

                            for(let review of reviews) {
                                delete review.id;
                            }

                            activitiesOrganized[activity_token] = {
                                ...activity,
                                persons: personsOrganized,
                                reviews,
                                reviewsCopy
                            };
                        }

                        let activitiesSendData = structuredClone(activitiesOrganized);

                        for(let at in activitiesSendData) {
                            let activity = activitiesSendData[at];

                            delete activity.reviewsCopy;
                        }


                        const axiosInstance = axios.create({
                            timeout: defaultTimeout,
                        });

                        let sync_url = getURL(network.network.api_domain, joinPaths('sync', 'reviews'));

                        let r = await axiosInstance.put(sync_url, {
                            secret_key: network.secret_key,
                            network_token: networkSelf.network_token,
                            activities: activitiesSendData
                        });

                        if(r.status === 202) {
                            let saveSyncedIds = [];

                            let responseData = r.data || {};

                            let errors = responseData.errors || {
                                activities: {},
                                persons: {
                                    from: {},
                                    to: {}
                                }
                            };

                            for(let activity_token in activitiesOrganized) {
                                if(activity_token in errors.activities) {
                                    continue;
                                }

                                let activity = activitiesOrganized[activity_token];

                                let reviews = activity.reviews;

                                //todo
                            }

                            if(saveSyncedIds.length) {
                                await conn('activities_persons_reviews')
                                    .whereIn('id', saveSyncedIds)
                                    .update({
                                        is_synced: true
                                    });
                            }

                        } else {
                            skipSaveTimestamps = true;
                        }
                    }

                    if (!skipSaveTimestamps && !debug_sync_enabled) {
                        let sync_update = {
                            sync_process: sync_name,
                            network_id: network.id,
                            last_updated: timestamps.current,
                            created: last_sync ? last_sync.created : timeNow(),
                            updated: timeNow(),
                        };

                        await setNetworkSyncProcess(sync_name, network.network.id, sync_update);
                    }

                    console.log();
                } catch (e) {
                    console.error(e);
                }
            }
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            await cacheService.init();

            networkSelf = await getNetworkSelf();

            if (!networkSelf) {
                return reject();
            }

            if (networkSelf.is_befriend) {
                return resolve();
            }

            await syncReviews();

            resolve();
        } catch (e) {
            console.error('Error getting own network', e);
            return reject();
        }
    });
}

module.exports = {
    main,
};

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
