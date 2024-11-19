/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('music_spotify_genres', function(table) {
        table.increments('id').unsigned().primary();
        table.string('name', 100).nullable();
        table.boolean('is_merged').defaultTo(0);

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('name');
    }).createTable('music_genres_spotify_genres', function(table) {
        table.increments('id').unsigned().primary();
        table.integer('genre_id').unsigned().nullable();
        table.integer('spotify_genre_id').unsigned().nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.foreign('genre_id')
            .references('id')
            .inTable('music_genres');

        table.foreign('spotify_genre_id')
            .references('id')
            .inTable('music_spotify_genres');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('music_genres_spotify_genres')
        .dropTableIfExists('music_spotify_genres');
};