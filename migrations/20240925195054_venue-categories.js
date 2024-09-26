/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('venues_categories', table => {
        table.increments('id').unsigned().primary();

        table.integer('parent_id').unsigned().nullable();

        table.integer('fsq_id').nullable();

        table.string('category_token').notNullable();

        table.string('category_name').notNullable();

        table.string('category_name_full').notNullable();

        table.string('category_image').nullable();

        table.integer('activities_count').defaultTo(0);

        table.float('category_position', 7, 3).nullable().defaultTo(0);

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        table.foreign('parent_id').references('id').inTable('venue_categories');

        table.index('fsq_id', 'venues_categories_fsq_id_index');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('venues_categories');
};
