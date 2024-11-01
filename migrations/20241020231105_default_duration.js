/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.integer('default_duration_min').nullable().defaultTo(30).after('sort_position');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.dropColumn('default_duration_min');
    });
};
