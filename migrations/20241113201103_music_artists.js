exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('music_artists', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('artist_name', 255).notNullable();
            table.string('apple_id', 64).nullable();
            table.string('mb_id', 64).nullable();
            table.boolean('is_active').notNullable().defaultTo(true);

            table.float('apple_position').nullable();
            table.float('mb_score').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
            table.index('apple_id');
            table.index('mb_id');
        }),

        knex.schema.createTable('music_artists_genres', function (table) {
            table.increments('id').primary();

            table.integer('artist_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.integer('position').nullable();

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('artist_id');
            table.index('genre_id');

            table.foreign('artist_id')
                .references('id')
                .inTable('music_artists');

            table.foreign('genre_id')
                .references('id')
                .inTable('music_genres');
        }),

        knex.schema.createTable('music_artists_genres_countries', function (table) {
            table.increments('id').primary();

            table.integer('artist_id').unsigned().notNullable();
            table.integer('country_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.integer('position').notNullable().defaultTo(0);

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('artist_id');
            table.index('country_id');
            table.index('genre_id');

            table.foreign('artist_id')
                .references('id')
                .inTable('music_artists');

            table.foreign('country_id')
                .references('id')
                .inTable('open_countries');

            table.foreign('genre_id')
                .references('id')
                .inTable('music_genres');
        })
    ]);
};

exports.down = function (knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('music_artists_genres_countries'),
        knex.schema.dropTableIfExists('music_artists_genres'),
        knex.schema.dropTableIfExists('music_artists')
    ]);
};