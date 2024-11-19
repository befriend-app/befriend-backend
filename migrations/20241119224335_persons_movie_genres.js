exports.up = function(knex) {
    return knex.schema.createTable('persons_movie_genres', function(table) {
        table.bigIncrements('id').primary();

        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('genre_id').unsigned().notNullable();
        table.string('genre_token', 32).notNullable();

        table.boolean('is_favorite').defaultTo(false);
        table.integer('favorite_position').nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('person_id');

        table.foreign('person_id')
            .references('id')
            .inTable('persons');

        table.foreign('genre_id')
            .references('id')
            .inTable('movie_genres');
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists('persons_movie_genres');
};