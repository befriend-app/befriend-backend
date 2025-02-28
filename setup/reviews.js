const cacheService = require('../services/cache');
const dbService = require('../services/db');
const { loadScriptEnv, timeNow } = require('../services/shared');
const { deleteKeys } = require('../services/cache');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add review types');

        let reviewTypes = [
            {
                review_name: 'Safety',
                token: 'safety',
                is_safety: true,
                is_active: true,
            },
            {
                review_name: 'Trust',
                token: 'trust',
                is_trust: true,
                is_active: true,
            },
            {
                review_name: 'Timeliness',
                token: 'timeliness',
                is_timeliness: true,
                is_active: true,
            },
            {
                review_name: 'Friendliness',
                token: 'friendliness',
                is_friendliness: true,
                is_active: true,
            },
            {
                review_name: 'Fun',
                token: 'fun',
                is_fun: true,
                is_active: true,
            },
        ];

        let table_review_name = 'reviews';

        try {
            let conn = await dbService.conn();

            for (let i = 0; i < reviewTypes.length; i++) {
                let type = reviewTypes[i];
                type.sort_position = i;

                //find is col review_name
                let is_col = null;

                for (let k in type) {
                    if (k.startsWith('is_')) {
                        is_col = k;
                        break;
                    }
                }

                let exists = await conn(table_review_name).where(is_col, true).first();

                let data = {};

                for (let k in type) {
                    data[k] = type[k];
                }

                data.updated = timeNow();

                if (exists) {
                    await conn(table_review_name).where('id', exists.id).update(data);
                } else {
                    data.created = timeNow();

                    await conn(table_review_name).insert(data);
                }
            }
        } catch (e) {
            console.error(e);
            return reject();
        }

        console.log('review types added');

        resolve();
    });
}

module.exports = {
    main: main,
};

//script executed directly
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
