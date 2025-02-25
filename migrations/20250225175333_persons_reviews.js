/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.dropTableIfExists('persons_reviews')

    await knex.schema.createTable('activities_persons_reviews', (table) => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_from_id').unsigned().notNullable();
        table.bigInteger('person_to_id').unsigned().notNullable();
        table.bigInteger('activity_id').unsigned().notNullable();
        table.integer('review_id').unsigned().nullable();
        table.boolean('no_show').nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('person_from_id');
        table.index('person_to_id');
        table.index('activity_id');
        table.index('review_id');

        table.foreign('person_from_id').references('id').inTable('persons');
        table.foreign('person_to_id').references('id').inTable('persons');
        table.foreign('activity_id').references('id').inTable('activities');
        table.foreign('review_id').references('id').inTable('reviews');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('activities_persons_reviews')
};
