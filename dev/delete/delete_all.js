const { loadScriptEnv, isProdApp } = require('../../services/shared');

loadScriptEnv();

function main(is_me) {
    return new Promise(async (resolve, reject) => {
        console.log('Delete: all');

        if (isProdApp()) {
            console.error('App env: [prod]', 'exiting');
            process.exit();
        }

        let scripts = [
            'delete_filters',
            'delete_me_all',
            'delete_activity_types',
            'delete_persons',
            'delete_personal',
            'delete_open_locations',
            'delete_places',
        ];

        for (let script of scripts) {
            let fn = `./${script}`;

            await require(fn).main();
        }

        process.exit();
    });
}

module.exports = {
    main: main,
};

if (require.main === module) {
    (async function () {
        try {
            await main(true);
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
