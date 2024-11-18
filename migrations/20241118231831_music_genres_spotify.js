/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('music_genres_spotify', function(table) {
        table.increments('id').unsigned().primary();
        table.string('name', 100).nullable();
        table.integer('genre_id').unsigned().nullable();
        table.bigInteger('created').nullable();
        table.bigInteger('updated').nullable();

        table.index('genre_id');
        table.index('name');

        table.foreign('genre_id')
            .references('id')
            .inTable('music_genres');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('music_genres_spotify');
};