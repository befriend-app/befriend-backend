exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('books', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('ol_id', 32).notNullable().unique();
            table.string('title', 255).notNullable();
            table.text('description').nullable();
            table.string('first_publish_date', 32).nullable();
            table.string('cover_id', 32).nullable();
            table.float('rating_average').nullable();
            table.integer('rating_count').nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
            table.index('ol_id');
        }),

        knex.schema.createTable('authors', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('ol_id', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.string('birth_date', 32).nullable();
            table.string('death_date', 32).nullable();
            table.float('rating_average').nullable();
            table.integer('rating_count').nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
            table.index('ol_id');
        }),

        knex.schema.createTable('book_genres', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.integer('position').nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.boolean('is_featured').notNullable().defaultTo(false);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
        }),

        knex.schema.createTable('books_genres', function (table) {
            table.increments('id').primary();
            table.integer('book_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('book_id').references('id').inTable('books');
            table.foreign('genre_id').references('id').inTable('book_genres');

            table.unique(['book_id', 'genre_id']);
            table.index(['genre_id']);
        }),

        knex.schema.createTable('books_authors', function (table) {
            table.increments('id').primary();
            table.integer('book_id').unsigned().notNullable();
            table.integer('author_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('book_id').references('id').inTable('books');
            table.foreign('author_id').references('id').inTable('authors');

            table.unique(['book_id', 'author_id']);
            table.index(['author_id']);
        }),

        knex.schema.createTable('persons_books', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('book_id').unsigned().notNullable();
            table.string('book_token', 32).notNullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('book_id').references('id').inTable('books');

            table.unique(['person_id', 'book_id']);
        }),

        knex.schema.createTable('persons_authors', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('author_id').unsigned().notNullable();
            table.string('author_token', 32).notNullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('author_id').references('id').inTable('authors');

            table.unique(['person_id', 'author_id']);
        }),

        knex.schema.createTable('persons_book_genres', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('genre_id').unsigned().notNullable();
            table.string('genre_token', 32).notNullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('genre_id').references('id').inTable('book_genres');

            table.unique(['person_id', 'genre_id']);
        }),
    ]);
};

exports.down = function (knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('persons_book_genres'),
        knex.schema.dropTableIfExists('persons_authors'),
        knex.schema.dropTableIfExists('persons_books'),
        knex.schema.dropTableIfExists('books_genres'),
        knex.schema.dropTableIfExists('books_authors'),
        knex.schema.dropTableIfExists('book_genres'),
        knex.schema.dropTableIfExists('authors'),
        knex.schema.dropTableIfExists('books'),
    ]);
};
