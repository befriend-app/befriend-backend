/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks', table => {
        table.integer('priority').notNullable().defaultTo(100)
            .after('api_domain');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.table('networks', table => {
        table.dropColumn('priority');
    });
};
