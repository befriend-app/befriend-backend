/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('activity_type_venues', table => {
        table.increments('id').unsigned().primary();

        table.integer('activity_type_id').unsigned().notNullable();

        table.integer('venue_category_id').unsigned().notNullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        table.foreign('activity_type_id').references('id').inTable('activity_types');
        table.foreign('venue_category_id').references('id').inTable('venue_categories');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('activity_type_venues');
};
