/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('persons_music_genres', function (table) {
            table.bigIncrements('id').primary();

            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.string('genre_token').nullable();

            table.boolean('is_favorite').defaultTo(0);
            table.integer('favorite_position').nullable();

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('genre_id').references('id').inTable('music_genres');
        }),

        knex.schema.createTable('persons_music_artists', function (table) {
            table.bigIncrements('id').primary();

            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('artist_id').unsigned().notNullable();
            table.string('artist_token').nullable();

            table.boolean('is_favorite').defaultTo(0);
            table.integer('favorite_position').nullable();

            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('artist_id').references('id').inTable('music_artists');
        })
    ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return Promise.all([
        knex.schema.dropTable('persons_music_genres'),
        knex.schema.dropTable('persons_music_artists'),
    ]);
};
