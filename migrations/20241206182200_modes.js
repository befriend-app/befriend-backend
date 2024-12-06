exports.up = async function(knex) {
    await knex.schema.createTable('modes', table => {
        table.increments('id').primary();
        table.string('token').notNullable().unique();
        table.string('name').notNullable();
        table.integer('sort_position').notNullable().defaultTo(0);
        table.boolean('is_visible').notNullable().defaultTo(true);
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('modes');
};