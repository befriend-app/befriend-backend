/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks', table => {
        table.boolean('is_network_known').notNullable().defaultTo(false)
            .after('priority');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.table('networks', table => {
        table.dropColumn('is_network_known');
    });
};
