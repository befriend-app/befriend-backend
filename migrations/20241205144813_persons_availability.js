exports.up = function(knex) {
    return knex.schema.createTable('persons_availability', table => {
        table.increments('id').primary();
        table.bigInteger('person_id').unsigned().notNullable().references('id').inTable('persons');
        table.integer('day_of_week').notNullable().comment('0-6 for Sunday-Saturday');
        table.time('start_time').notNullable();
        table.time('end_time').notNullable();
        table.boolean('is_overnight').notNullable().defaultTo(false);
        table.boolean('is_any_time').notNullable().defaultTo(false);
        table.boolean('is_active').notNullable().defaultTo(true);
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('person_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    knex.schema.dropTableIfExists('persons_availability');
};
