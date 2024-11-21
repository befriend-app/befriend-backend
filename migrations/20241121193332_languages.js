exports.up = function(knex) {
    return Promise.all([
        knex.schema.createTable('languages', function(table) {
            table.increments('id').primary();
            table.string('token').notNullable();
            table.string('name', 255).notNullable();
            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(1);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('top_languages_countries', function(table) {
            table.increments('id').primary();
            table.integer('language_id').unsigned().notNullable();
            table.integer('country_id').unsigned().notNullable();

            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(1);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('language_id').references('id').inTable('languages');
            table.foreign('country_id').references('id').inTable('open_countries');
        }),

        knex.schema.createTable('persons_languages', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('language_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('language_id').references('id').inTable('languages');
        })
    ]);
};

exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('persons_languages')
        .dropTableIfExists('languages_countries')
        .dropTableIfExists('languages');
};