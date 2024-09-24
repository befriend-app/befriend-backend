/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('persons', table => {
        table.mediumint('location_lat_1000').nullable()
            .after('location_lat');

        table.index(['location_lat_1000', 'location_lon']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.alterTable('persons', table => {
        table.dropColumn('location_lat_1000');
    });
};
