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
            'delete_me_all',
            'delete_activity_venues',
            'delete_persons',
            'delete_open_locations',
            'delete_places',
        ];

        for (let script of scripts) {
            console.log(`Deleting: ${script}`);

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
