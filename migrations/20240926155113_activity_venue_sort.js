/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_type_venues', (table) => {
        table.float('sort_position', 6, 3).defaultTo(0).notNullable().after(`venue_category_id`);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_type_venues', (table) => {
        table.dropColumn('sort_position');
    });
};
