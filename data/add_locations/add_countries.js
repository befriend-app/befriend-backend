const axios = require('axios');
const { loadScriptEnv, timeNow } = require('../../services/shared');
const dbService = require('../../services/db');
const { wikiCountries } = require('./wiki-countries');

loadScriptEnv();

const source_link = `https://raw.githubusercontent.com/grafana/worldmap-panel/refs/heads/master/src/data/countries.json`;

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Adding countries to DB');

            let conn = await dbService.conn();

            let r = await axios.get(source_link);

            let countries = r.data;

            for (let country of countries) {
                let check = await conn('open_countries')
                    .where('country_name', country.name)
                    .first();

                let wiki_code = null;
                let emoji = null;

                let wikiCountry = wikiCountries[country.name];

                if (wikiCountry) {
                    wiki_code = wikiCountry.code;
                    emoji = wikiCountry.emoji;
                }

                if (!check) {
                    await conn('open_countries').insert({
                        country_name: country.name,
                        country_code: country.key,
                        emoji: emoji,
                        lat: country.latitude,
                        lon: country.longitude,
                        wiki_code: wiki_code,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                } else {
                    await conn('open_countries').where('id', check.id).update({
                        emoji: emoji,
                        wiki_code: wiki_code,
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }
            }

            resolve();
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
