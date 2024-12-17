const dbService = require('./db');

const appModes = [
    {
        token: 'mode-solo',
        name: 'Solo',
    },
    {
        token: 'mode-partner',
        name: 'Partner',
    },
    {
        token: 'mode-kids',
        name: 'Kids',
    },
];

function getModes() {
    return new Promise(async (resolve, reject) => {
        if (module.exports.modes.lookup) {
            return resolve(module.exports.modes.lookup);
        }

        try {
            let conn = await dbService.conn();

            let data = await conn('modes')
                .whereNull('deleted');

            let organized = data.reduce(
                (acc, item) => {
                    acc.byId[item.id] = item;
                    acc.byToken[item.token] = item;
                    return acc;
                },
                { byId: {}, byToken: {} },
            );

            module.exports.modes.lookup = organized;

            resolve(organized);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    modes: {
        data: appModes,
        lookup: null
    },
    getModes
};