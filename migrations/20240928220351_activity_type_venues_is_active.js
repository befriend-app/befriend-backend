/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_type_venues', (table) => {
        table.boolean('is_active').defaultTo(1).notNullable().after(`sort_position`);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_type_venues', (table) => {
        table.dropColumn('is_active');
    });
};
