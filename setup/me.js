function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Loading me data');

            await require('./me/sections').main();

            await require('./me/drinking').main();
            await require('./me/instruments').main();
            await require('./me/kids_ages').main();
            await require('./me/languages').main();
            await require('./me/life_stages').main();
            await require('./me/politics').main();
            await require('./me/relationship_status').main();
            await require('./me/religions').main();
            await require('./me/smoking').main();
            await require('./me/work').main();

            await require('./me/movies').main();
            await require('./me/music').main();
            await require('./me/schools').main();
            await require('./me/sports').main();
            await require('./me/tv_shows').main();
        } catch (e) {
            console.error(e);
            return reject();
        }

        resolve();
    });
}

module.exports = {
    main: main,
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
