/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('open_cities', (table) => {
            table.float('bbox_lat_min', 8, 4).nullable().alter();
            table.float('bbox_lat_max', 8, 4).nullable().alter();

            table.float('bbox_lon_min', 8, 4).nullable().alter();
            table.float('bbox_lon_max', 8, 4).nullable().alter();

            table.mediumint('bbox_lat_min_1000').nullable().alter();
            table.mediumint('bbox_lat_max_1000').nullable().alter();

            table.mediumint('bbox_lon_min_1000').nullable().alter();
            table.mediumint('bbox_lon_max_1000').nullable().alter();
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
};
