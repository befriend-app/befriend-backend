exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('movie_genres', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.integer('tmdb_id').notNullable().unique();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('movies_genres', function (table) {
            table.increments('id').primary();
            table.integer('movie_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.unique(['movie_id', 'genre_id']);

            table.foreign('movie_id').references('id').inTable('movies');

            table.foreign('genre_id').references('id').inTable('movie_genres');
        }),
    ]);
};

exports.down = function (knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('movies_genres'),
        knex.schema.dropTableIfExists('movie_genres'),
    ]);
};
