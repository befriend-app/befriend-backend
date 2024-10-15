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

                knex = require("knex")({
                    client: process.env.DB_CLIENT,
                    connection: connection,
                });

                module.exports.dbConns[db_name] = knex;
            }

            return resolve(knex);
        });
    },
    batchInsert: function (to_conn, table_name, insert_rows, add_id_prop) {
        return new Promise(async (resolve, reject) => {
            let output = [];

            try {
                let cols = await to_conn(table_name).columnInfo();

                let chunk_items_count = Number.parseInt(module.exports.max_placeholders / Object.keys(cols).length) - 1;

                let chunks = require("lodash").chunk(insert_rows, chunk_items_count);

                for (let chunk of chunks) {
                    let id = await to_conn.batchInsert(table_name, chunk);

                    output.push([id[0], id[0] + chunk.length - 1]);

                    if(add_id_prop) {
                        for(let i = 0; i < chunk.length; i++) {
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
};
