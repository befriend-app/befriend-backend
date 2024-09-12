module.exports = {
    max_placeholders: 65536,
    keys: {
    },
    dbConns: {},
    conn: function() {
        return new Promise(async (resolve, reject) => {
            let knex;

            let db_name = process.env.DB_NAME;

            if(db_name in module.exports.dbConns) {
                knex = module.exports.dbConns[db_name];
            } else {
                let connection = {
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: db_name
                };

                knex = require('knex')({
                    client: process.env.DB_CLIENT,
                    connection: connection
                });

                module.exports.dbConns[db_name] = knex;
            }

            return resolve(knex);
        });

    },
    batchInsert: function (to_conn, table_name, insert_rows) {
        return new Promise(async (resolve, reject) => {
            try {
                let cols = await to_conn(table_name).columnInfo();

                let chunk_items_count = Number.parseInt((module.exports.max_placeholders / Object.keys(cols).length)) - 1;

                let chunks = require('lodash').chunk(insert_rows, chunk_items_count);

                for(let chunk of chunks) {
                    await to_conn.batchInsert(table_name, chunk);
                }
            } catch(e) {
                return reject(e);
            }

            return resolve();
        });
    }
};