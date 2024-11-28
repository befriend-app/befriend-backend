exports.up = function(knex) {
    return Promise.all([
        knex.schema.createTable('tv_genres', function(table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.integer('tmdb_id').notNullable().unique();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('tv_shows', function(table) {
            table.increments('id').primary();
            table.integer('tmdb_id').nullable().unique();
            table.string('tmdb_poster_path').nullable();
            table.string('token', 255).notNullable();
            table.string('name').notNullable();
            table.string('original_language').nullable();
            table.date('first_air_date').notNullable();
            table.string('year_from').nullable();
            table.string('year_to').nullable();
            table.float('popularity', 10, 4).nullable();
            table.integer('users_added_count').notNullable().defaultTo(0);
            table.boolean('genre_processed').notNullable().defaultTo(false);

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
            table.index('tmdb_id');
            table.index('first_air_date');
        }),

        knex.schema.createTable('tv_shows_genres', function(table) {
            table.increments('id').primary();
            table.integer('show_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.unique(['show_id', 'genre_id']);

            table.foreign('show_id').references('id').inTable('tv_shows');
            table.foreign('genre_id').references('id').inTable('tv_genres');
        }),

        knex.schema.createTable('persons_tv_shows', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('show_id').unsigned().notNullable();
            table.string('show_token', 32).notNullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('person_id');
            table.index('show_id');

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('show_id').references('id').inTable('tv_shows');
        }),

        knex.schema.createTable('persons_tv_genres', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.string('genre_token', 32).nullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('genre_id').references('id').inTable('tv_genres');
        })
    ]);
};

exports.down = function(knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('persons_tv_genres'),
        knex.schema.dropTableIfExists('persons_tv_shows'),
        knex.schema.dropTableIfExists('tv_shows_genres'),
        knex.schema.dropTableIfExists('tv_shows'),
        knex.schema.dropTableIfExists('tv_genres')
    ]);
};