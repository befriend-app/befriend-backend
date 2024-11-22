/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema.alterTable('open_cities', (table) => {
            table.float('lat', 8, 4).notNullable().alter();
            table.float('lon', 8, 4).notNullable().alter();

            table.float('bbox_lat_min', 8, 4).notNullable().alter();
            table.float('bbox_lat_max', 8, 4).notNullable().alter();

            table.float('bbox_lon_min', 8, 4).notNullable().alter();
            table.float('bbox_lon_max', 8, 4).notNullable().alter();
        });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return new Promise(async (resolve, reject) => {
        resolve();
    });
};
