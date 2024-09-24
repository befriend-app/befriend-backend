/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('system', table => {
        table.increments('id').unsigned().primary();
        table.string('system_key').notNullable();
        table.string('system_value').nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('system');
};
