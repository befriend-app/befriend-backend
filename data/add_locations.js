function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Loading locations");

            await require("./add_locations/add_countries").main();
            await require("./add_locations/add_cities").main();

            console.log("Locations loaded");
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main: main
}

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