function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Loading me data');

            await require('./me/sections').main();
            await require('./me/drinking').main();
            await require('./me/instruments').main();
            await require('./me/schools').main();
            await require('./me/movies').main();
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
