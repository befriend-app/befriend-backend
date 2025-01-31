const {
    loadScriptEnv,
} = require('../../services/shared');

const yargs = require('yargs');
let args = yargs.argv;
let numPersons = 1000;

if(args.n) {
    numPersons = args.n;
} else if (args._ && args._.length) {
    numPersons = args._[0];
}

function main() {
    loadScriptEnv();

    return new Promise(async (resolve, reject) => {
        try {
            const personsScript = require('./persons');
            const meScript = require('./me');
            const reviewsScript = require('./reviews');
            const filtersScript = require('./filters');
            const availabilityScript = require('./availability');
            const devicesScript = require('./devices');

            console.log('Simulate: Persons');
            await personsScript.main(numPersons);

            console.log('Simulate: Me');
            await meScript.main(numPersons);

            console.log('Simulate: Reviews');
            await reviewsScript.main(numPersons);

            console.log('Simulate: Filters');
            await filtersScript.main(numPersons);

            console.log('Simulate: Availability');
            await availabilityScript.main(numPersons);

            console.log('Simulate: Devices');
            await devicesScript.main(numPersons);
        } catch(e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main
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