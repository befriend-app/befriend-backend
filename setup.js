const { loadScriptEnv, timeNow, getTimeFromSeconds } = require('./services/shared');
loadScriptEnv();

(async function () {
    try {
        let time_start = timeNow(true);

        //setup db
        await require('./setup/migrate').main();

        //add/update data
        await require('./setup/modes').main();
        await require('./setup/genders').main();
        await require('./setup/activity-types').main();
        await require('./setup/filters').main();
        await require('./setup/locations').main();
        await require('./setup/me').main();

        console.log({
            setup_time: getTimeFromSeconds(timeNow(true) - time_start),
        });
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
