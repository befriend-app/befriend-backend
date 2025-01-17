const {
    loadScriptEnv,
} = require('../../services/shared');

const yargs = require('yargs');
let args = yargs.argv;
let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
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
            await personsScript.main(num_persons);

            console.log('Simulate: Me');
            await meScript.main(num_persons);

            console.log('Simulate: Reviews');
            await reviewsScript.main(num_persons);

            console.log('Simulate: Filters');
            await filtersScript.main(num_persons);

            console.log('Simulate: Availability');
            await availabilityScript.main(num_persons);

            console.log('Simulate: Devices');
            await devicesScript.main(num_persons);
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