const Knex = require('knex');
const { loadScriptEnv } = require('../services/shared');
const color = require('colorette');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        console.log('Migrate DB');

        let required = ['DB_NAME', 'DB_HOST', 'DB_USER', 'DB_PASSWORD'];

        let missing = [];

        for (let key of required) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }

        if (missing.length) {
            console.error({
                message: '.env keys needed',
                keys: missing,
            });

            return reject();
        }

        let connection = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        };

        if (process.env.DB_PORT) {
            connection.port = parseInt(process.env.DB_PORT);
        }

        let knex = Knex({
            client: process.env.DB_CLIENT,
            connection: connection,
        });

        await knex.raw('CREATE DATABASE IF NOT EXISTS ??', process.env.DB_NAME);

        connection.database = process.env.DB_NAME;

        knex = Knex({
            client: process.env.DB_CLIENT,
            connection: connection,
        });

        let output = await knex.migrate.latest();

        if (!output[1].length) {
            console.log(color.cyan('Already up to date'));
        } else {
            console.log(
                color.green(
                    `Batch ${output[0]} run: ${output[1].length} migration${output[1].length > 1 ? 's' : ''}`,
                ),
            );
        }

        resolve();
    });
}

module.exports = {
    main: main,
};

//script executed directly
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
