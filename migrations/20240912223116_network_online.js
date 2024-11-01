/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('networks', (table) => {
        table.boolean('is_online').notNullable().defaultTo(false).after('is_trusted');

        table.integer('last_online').nullable().after('is_online');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('networks', (table) => {
        table.dropColumn('is_online');
        table.dropColumn('last_online');
    });
};
