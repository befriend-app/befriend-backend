/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('open_cities', (table) => {
            table.string('token').notNullable().after('id');
        })
        .alterTable('open_states', (table) => {
            table.string('token').notNullable().after('id');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('open_cities', (table) => {
            table.dropColumn('token');
        })
        .alterTable('open_states', (table) => {
            table.dropColumn('token');
        });
};
