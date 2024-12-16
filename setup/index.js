const { loadScriptEnv, timeNow, getTimeFromSeconds } = require('../services/shared');
loadScriptEnv();

(async function () {
    try {
        let time_start = timeNow(true);

        //setup db
        await require('./migrate').main();

        //add/update data
        await require('./modes').main();
        await require('./genders').main();
        await require('./activity-types').main();
        await require('./filters').main();
        await require('./locations').main();
        await require('./me').main();

        console.log({
            setup_time: getTimeFromSeconds(timeNow(true) - time_start),
        });
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
