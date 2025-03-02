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
            const persons = require('./persons');
            const me = require('./me');
            const reviews = require('./reviews');
            const filters = require('./filters');
            const availability = require('./availability');
            const devices = require('./devices');

            console.log('Simulate: Persons');
            await persons.main(numPersons);

            console.log('Simulate: Me');
            await me.main(numPersons);

            console.log('Simulate: Reviews');
            await reviews.main(numPersons);

            console.log('Simulate: Filters');
            await filters.main(numPersons);

            console.log('Simulate: Availability');
            await availability.main(numPersons);

            console.log('Simulate: Devices');
            await devices.main(numPersons);
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