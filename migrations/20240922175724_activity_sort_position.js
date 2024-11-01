/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.float('sort_position', 5, 3).notNullable().defaultTo(1).after('activity_icon');

        table.boolean('is_visible').defaultTo(true).after('sort_position');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
