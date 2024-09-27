const cacheService = require('../services/cache');
const dbService = require('../services/db');
const {timeNow, loadScriptEnv, generateToken, cloneObj} = require("../services/shared");

(async function() {
    loadScriptEnv();

    let venues_dict = {};
    let activity_venues_dict = {};

    let conn = await dbService.conn();

    let activity_types = require('./activity_venues/activity-types');
    let venue_categories = require("./activity_venues/add_venues_categories");

    try {
        //remove previous cache if any
        await cacheService.deleteKeys(cacheService.keys.activity_venues);

        //add venue categories
        await venue_categories.main();

        //organize for performance
        let qry = await conn('venues_categories');

        for(let item of qry) {
            venues_dict[item.fsq_id] = item;
        }

        let venue_qry = await conn('activity_type_venues');

        for(let item of venue_qry) {
            if(!(item.activity_type_id in activity_venues_dict)) {
                activity_venues_dict[item.activity_type_id] = {};
            }

            activity_venues_dict[item.activity_type_id][item.venue_category_id] = true;
        }
    } catch(e) {
        console.error(e);
    }


    let bools = [
        `is_meet`, 'is_eat', 'is_drink', 'is_walk', 'is_exercise',
        'is_watch', 'is_fun', 'is_dance', 'is_attend', 'is_relax',
        `is_discover`, 'is_travel', 'is_shop', 'is_kids'
    ];

    let activity_dict = {};

    function processActivity(activity, int, parent_ids, bool) {
        return new Promise(async (resolve, reject) => {
            let at_check;

            let id;

            let parent_id = null;

            if(parent_ids && parent_ids.length) {
                parent_id = parent_ids[parent_ids.length - 1];
            }

            let activity_full_name = activity.name;

            let activity_full_add = [];

            if(parent_ids.length) {
                for(let _id of parent_ids) {
                    activity_full_add.push(activity_dict[_id].activity_name);
                }

                activity_full_name += `: ${activity_full_add.join(' - ')}`;
            }

            try {
                at_check = await conn('activity_types')
                    .where('activity_name_full', activity_full_name)
                    .first();
            } catch(e) {
                console.error(e);
            }

            let insert;

            if(!at_check) {
                insert = {
                    parent_activity_type_id: parent_id,
                    activity_type_token: generateToken(24),
                    activity_name: activity.name,
                    activity_name_full: activity_full_name,
                    activity_image: activity.image || null,
                    activity_emoji: activity.emoji || null,
                    sort_position: int,
                    is_visible: true,
                    created: timeNow(),
                    updated: timeNow()
                };

                if(bool) {
                    insert[bool] = true;
                }

                id = await conn('activity_types')
                    .insert(insert);

                id = id[0];
            } else {
                id = at_check.id;
            }

            //add activity venue category
            for(let i = 0; i < activity.fsq_ids.length; i++) {
                let fsq_id = activity.fsq_ids[i];

                let db_id = venues_dict[fsq_id].id;

                //previously added
                if(id in activity_venues_dict && db_id in activity_venues_dict[id]) {
                    continue;
                }

                try {
                     await conn('activity_type_venues')
                         .insert({
                             activity_type_id: id,
                             venue_category_id: db_id,
                             sort_position: i,
                             created: timeNow(),
                             updated: timeNow()
                         });
                } catch(e) {
                    console.error(e);
                }
            }

            parent_ids.push(id);

            activity_dict[id] = insert || at_check;

            if(activity.sub) {
                for(let int = 0; int < activity.sub.length; int++) {
                    try {
                         await processActivity(activity.sub[int], int, cloneObj(parent_ids), bool);
                    } catch(e) {
                        console.error(e);
                    }
                }
            }

            resolve();
        });
    }

    for(let int = 0; int < activity_types.length; int++) {
        let activity = activity_types[int];

        let parent_ids = [];

        let activity_bool = null;

        for(let bool of bools) {
            if(bool in activity) {
                activity_bool = bool;
            }
        }

        try {
             await processActivity(activity, int, parent_ids, cloneObj(activity_bool));
        } catch(e) {
            console.error(e);
        }
    }

    process.exit();
})();