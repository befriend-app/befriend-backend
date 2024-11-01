/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('networks', (table) => {
        table.boolean('is_self').notNullable().defaultTo(false).after('api_domain');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('networks', (table) => {
        table.dropColumn('is_self');
    });
};
