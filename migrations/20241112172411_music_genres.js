exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('music_genres', function (table) {
            table.increments('id').primary();

            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();

            table.integer('parent_id').unsigned().nullable();

            table.string('apple_id', 64).nullable();

            table.boolean('is_active').notNullable().defaultTo(true);

            table.timestamp('created').notNullable();
            table.timestamp('updated').notNullable();
            table.timestamp('deleted').nullable();

            table.index('token');
            table.index('apple_id');

            table.foreign('parent_id')
                .references('id')
                .inTable('music_genres');
        }),

        knex.schema.createTable('music_genres_countries', function (table) {
            table.increments('id').primary();

            table.integer('country_id').unsigned().notNullable();

            table.integer('genre_id').unsigned().notNullable();

            table.integer('position').notNullable().defaultTo(0);

            table.timestamp('created').notNullable();
            table.timestamp('updated').notNullable();
            table.timestamp('deleted').nullable();

            table.index('country_id');
            table.index('genre_id');

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
        knex.schema.dropTableIfExists('music_genres_countries'),
        knex.schema.dropTableIfExists('music_genres')
    ]);
};