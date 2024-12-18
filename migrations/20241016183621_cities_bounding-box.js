/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('open_cities', (table) => {
        table.decimal('bbox_lat_min', 10, 7).notNullable().after('lon');
        table.decimal('bbox_lat_max', 10, 7).notNullable().after('bbox_lat_min');

        table.decimal('bbox_lon_min', 11, 7).notNullable().after('bbox_lat_max');
        table.decimal('bbox_lon_max', 11, 7).notNullable().after('bbox_lon_min');

        table.mediumint('bbox_lat_min_1000').notNullable().after('bbox_lon_max');
        table.mediumint('bbox_lat_max_1000').notNullable().after('bbox_lat_min_1000');

        table.mediumint('bbox_lon_min_1000').notNullable().after('bbox_lat_max_1000');
        table.mediumint('bbox_lon_max_1000').notNullable().after('bbox_lon_min_1000');

        table.index('bbox_lat_min_1000');
        table.index('bbox_lat_max_1000');
        table.index('bbox_lon_min_1000');
        table.index('bbox_lon_max_1000');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('open_cities', (table) => {
        let cols = [
            'bbox_lat_min',
            'bbox_lat_max',
            'bbox_lon_min',
            'bbox_lon_max',
            'bbox_lat_min_1000',
            'bbox_lat_max_1000',
            'bbox_lon_min_1000',
            'bbox_lon_max_1000',
        ];

        for (let col of cols) {
            table.dropColumn(col);
        }
    });
};
