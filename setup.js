const { loadScriptEnv, timeNow, getTimeFromSeconds } = require('./services/shared');
loadScriptEnv();

(async function () {
    try {

        let time_start = timeNow(true);

        await require('./setup/migrate').main();

        await require('./setup/genders').main();
        await require('./setup/activity-types').main();

        await require('./setup/filters').main();

        await require('./setup/locations').main();
        await require('./setup/me').main();

        console.log({
            setup_time: getTimeFromSeconds(timeNow(true) - time_start)
        });
    } catch (e) {
        console.error(e);
    }

    process.exit();
})();
