/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('sync', (table) => {
        table.bigIncrements('id').unsigned().primary();
        table.string('sync_process', 255).notNullable();
        table.integer('network_id').unsigned().notNullable();
        table.bigInteger('last_updated').nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        table.foreign('network_id').references('id').inTable('networks');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
