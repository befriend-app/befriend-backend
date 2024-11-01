function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Loading me data');

            await require('./me_sections/add_sections').main();
        } catch (e) {
            console.error(e);
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
