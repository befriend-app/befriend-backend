/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('networks', (table) => {
        table.string('base_domain').notNullable().after('network_logo');

        table.string('api_domain').notNullable().alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('networks', (table) => {
        table.dropColumn('base_domain');
    });
};
