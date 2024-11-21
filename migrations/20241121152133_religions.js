/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return Promise.all([
        knex.schema.createTable('religions', function(table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(true);

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('parent_id').references('id').inTable('religions');
        }),

        knex.schema.createTable('persons_religions', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('religion_id').unsigned().notNullable();

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('religion_id').references('id').inTable('religions');
        }),
    ]);
};

exports.down = function(knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('persons_religions'),
        knex.schema.dropTableIfExists('religions')
    ]);
};