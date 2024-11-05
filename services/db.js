module.exports = {
    max_placeholders: 65536,
    keys: {},
    dbConns: {},
    conn: function () {
        return new Promise(async (resolve, reject) => {
            let knex;

            let db_name = process.env.DB_NAME;

            if (db_name in module.exports.dbConns) {
                knex = module.exports.dbConns[db_name];
            } else {
                let connection = {
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: db_name,
                };

                if (process.env.DB_PORT) {
                    connection.port = parseInt(process.env.DB_PORT);
                }

                knex = require('knex')({
                    client: process.env.DB_CLIENT,
                    connection: connection,
                });

                module.exports.dbConns[db_name] = knex;
            }

            return resolve(knex);
        });
    },
    batchInsert: function (table_name, insert_rows, add_id_prop) {
        return new Promise(async (resolve, reject) => {
            let output = [];

            try {
                let conn = await module.exports.conn();

                let cols = await conn(table_name).columnInfo();

                let chunk_items_count =
                    Number.parseInt(module.exports.max_placeholders / Object.keys(cols).length) - 1;

                let chunks = require('lodash').chunk(insert_rows, chunk_items_count);

                for (let chunk of chunks) {
                    let id = await conn.batchInsert(table_name, chunk);

                    output.push([id[0], id[0] + chunk.length - 1]);

                    if (add_id_prop) {
                        for (let i = 0; i < chunk.length; i++) {
                            let item = chunk[i];
                            item.id = id[0] + i;
                        }
                    }
                }
            } catch (e) {
                return reject(e);
            }

            return resolve(output);
        });
    },
    batchUpdate: function (table_name, update_rows, id_column = 'id') {
        return new Promise(async (resolve, reject) => {
            let output;

            if (!Array.isArray(update_rows) || update_rows.length === 0) {
                return resolve();
            }

            try {
                let conn = await module.exports.conn();

                const cols = await conn(table_name).columnInfo();

                const chunk_items_count =
                    Number.parseInt(module.exports.max_placeholders / Object.keys(cols).length) - 1;

                const chunks = require('lodash').chunk(update_rows, chunk_items_count);

                let columnNames = Object.keys(chunks[0][0]);

                for (let chunk of chunks) {
                    if (!chunk.length) {
                        continue;
                    }

                    const updateSQL = `
                          INSERT INTO ?? (${columnNames.map(() => '??').join(', ')})
                          VALUES ${chunk.map(() => `(${columnNames.map(() => '?').join(', ')})`).join(', ')}
                          ON DUPLICATE KEY UPDATE ${columnNames
                              .filter((name) => name !== id_column)
                              .map((name) => `?? = VALUES(??)`)
                              .join(', ')}
                        `;

                    // Prepare the bindings
                    const insertBindings = [
                        table_name,
                        ...columnNames,
                        ...chunk.flatMap((row) => columnNames.map((name) => row[name])),
                        ...columnNames
                            .filter((name) => name !== id_column)
                            .flatMap((name) => [name, name]),
                    ];

                    // Execute the query
                    output = await conn.raw(updateSQL, insertBindings);
                }

                resolve();
            } catch (e) {
                console.error(e);
                return reject();
            }
        });
    },
};
