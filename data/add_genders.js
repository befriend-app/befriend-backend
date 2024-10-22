const dbService = require('../services/db');
const { timeNow, loadScriptEnv } = require('../services/shared');
loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Add genders');

        let conn = await dbService.conn();

        let genders = [
            {
                gender_token: 'b60284ewq84thz7l8z0me2w3cmet7x4w',
                gender_name: 'Male',
                sort_position: 1,
                is_visible: true,
                created: timeNow(),
                updated: timeNow(),
            },
            {
                gender_token: 'rgkkx68cqhocktsdrxshv0yhz2bhlmeh',
                gender_name: 'Female',
                sort_position: 2,
                is_visible: true,
                created: timeNow(),
                updated: timeNow(),
            },
            {
                gender_token: 'mg599met7um4k9ctsfz1uy5sf5m7yxmy',
                gender_name: 'Non-binary',
                sort_position: 3,
                is_visible: true,
                created: timeNow(),
                updated: timeNow(),
            },
            {
                gender_token: 'ro84cn3w8yfndjs36r28in3ltile3ooq',
                gender_name: 'Other',
                is_visible: true,
                sort_position: 4,
                created: timeNow(),
                updated: timeNow(),
            },
        ];

        for (let gender of genders) {
            let gender_check = await conn('genders')
                .where('gender_token', gender.gender_token)
                .first();

            if (!gender_check) {
                await conn('genders').insert(gender);
            }
        }

        console.log('Genders added');

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
