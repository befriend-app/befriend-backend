/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .createTable('me_sections', (table) => {
                table.increments('id').primary();
                table.string('section_key').notNullable();
                table.string('section_name').notNullable();
                table.text('icon').nullable();
                table.integer('position').notNullable().defaultTo(0);
                table.boolean('active').notNullable().defaultTo(true);
                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
            })
            .createTable('persons_sections', (table) => {
                table.bigIncrements('id').primary();
                table.bigInteger('person_id').unsigned().notNullable();
                table.integer('section_id').unsigned().notNullable();
                table.integer('position').notNullable().defaultTo(0);
                table.boolean('hidden').notNullable().defaultTo(false);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.foreign('person_id').references('id').inTable('persons');
                table.foreign('section_id').references('id').inTable('me_sections');
            })
            .createTable('movies', (table) => {
                table.increments('id').primary();
                table.integer('tmdb_id').nullable().unique();
                table.string('tmdb_poster_path').nullable();
                table.string('token', 255).notNullable();
                table.string('name').notNullable();
                table.string('original_language').nullable();
                table.date('release_date').notNullable();
                table.float('popularity', 10, 4).nullable();
                table.integer('users_added_count').notNullable().defaultTo(0);
                table.boolean('genre_processed').notNullable().defaultTo(false);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.index('token');
            })
            .createTable('persons_movies', (table) => {
                table.bigIncrements('id').primary();

                table.bigInteger('person_id').unsigned().notNullable();
                table.integer('movie_id').unsigned().notNullable();
                table.integer('position').notNullable().defaultTo(0);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.foreign('person_id').references('id').inTable('persons');
                table.foreign('movie_id').references('id').inTable('movies');
            });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return knex.schema
        .dropTableIfExists('persons_movies')
        .dropTableIfExists('movies')
        .dropTableIfExists('persons_sections')
        .dropTableIfExists('me_sections');
};
