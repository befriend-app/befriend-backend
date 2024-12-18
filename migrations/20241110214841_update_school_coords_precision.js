/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('schools', (table) => {
        table.string('source').nullable().alter();
        table.decimal('lat', 8, 4).nullable().alter();
        table.decimal('lon', 8, 4).nullable().alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
