const axios = require('axios');

const source_link = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000/exports/json?lang=en`;

function main() {
    return new Promise(async (resolve, reject) => {
        try {
             console.log("Downloading cities and populations");

             let r = await axios.get(source_link);

             let d = r.data;
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