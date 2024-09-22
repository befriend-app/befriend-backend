const dbService = require('../services/db');
const {timeNow, loadScriptEnv} = require("../services/shared");

(async function() {
    loadScriptEnv();

    let conn = await dbService.conn();

    let activity_types = [
        {
            activity_type_token: 'no7wj8ybioivivhkprlsy81blds3yove',
            activity_name: 'Eat & Drink',
            activity_icon: `🥗`,
            sort_position: 1,
            is_visible: true,
            created: timeNow(),
            updated: timeNow()
        },
        {
            activity_type_token: 'iumjdfb7kfclthcigzg41jw7uuz74t2t',
            activity_name: 'Walking',
            activity_icon: `🚶`,
            sort_position: 2,
            is_visible: true,
            created: timeNow(),
            updated: timeNow()
        },
        {
            activity_type_token: 'qeqamliagxpghj8qo0n5pqikpxemjhuy',
            activity_name: 'Movies',
            activity_icon: `📽️`,
            sort_position: 3,
            is_visible: true,
            created: timeNow(),
            updated: timeNow()
        },
        {
            activity_type_token: 'pcun9tgvlu6ouxtbqb34svstfzxxdheq',
            activity_name: 'Museum',
            activity_icon: `🖼️`,
            sort_position: 4,
            is_visible: true,
            created: timeNow(),
            updated: timeNow()
        },
        {
            activity_type_token: 'et4o5tli8rhcgdt3fkedafqcy9cxgjk8',
            activity_name: 'Sports',
            activity_icon: `🏈`,
            sort_position: 5,
            is_visible: true,
            created: timeNow(),
            updated: timeNow()
        },
    ];

    for(let at of activity_types) {
        let at_check = await conn('activity_types')
            .where('activity_type_token', at.activity_type_token)
            .first();

        if(!at_check) {
            await conn('activity_types')
                .insert(at);
        }
    }

    process.exit();
})();