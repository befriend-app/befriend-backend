exports.up = async function(knex) {
    await Promise.all([
            knex.schema.dropTableIfExists('persons_sports_teams'),
            knex.schema.dropTableIfExists('persons_sports_play'),
            knex.schema.dropTableIfExists('persons_sports_watch'),
            knex.schema.dropTableIfExists('sports_teams_leagues'),
            knex.schema.dropTableIfExists('sports_teams'),
            knex.schema.dropTableIfExists('sports_leagues'),
            knex.schema.dropTableIfExists('sports_countries'),
            knex.schema.dropTableIfExists('sports')
        ]
    );

    return Promise.all([
        knex.schema.createTable('sports', function(table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.index('token');
        }),

        knex.schema.createTable('sports_countries', function(table) {
            table.increments('id').primary();
            table.integer('sport_id').unsigned().notNullable();
            table.integer('country_id').unsigned().notNullable();
            table.integer('position').notNullable().defaultTo(0);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('sport_id').references('id').inTable('sports');
            table.foreign('country_id').references('id').inTable('open_countries');

            table.unique(['sport_id', 'country_id']);
            table.index(['country_id', 'position']);
        }),

        knex.schema.createTable('sports_leagues', function(table) {
            table.increments('id').primary();
            table.string('external_id', 60).nullable();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.string('short_name', 100).nullable();
            table.integer('sport_id').unsigned().notNullable();
            table.integer('country_id').unsigned().nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.integer('popularity').nullable();
            table.integer('season').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('sport_id').references('id').inTable('sports');
            table.foreign('country_id').references('id').inTable('open_countries');
            table.index('token');
            table.index('external_id');
        }),

        knex.schema.createTable('sports_teams', function(table) {
            table.increments('id').primary();
            table.string('external_id', 60).nullable();
            table.string('token', 32).notNullable().unique();
            table.string('name', 255).notNullable();
            table.string('short_name', 100).nullable();
            table.integer('sport_id').unsigned().notNullable();
            table.integer('country_id').unsigned().nullable();
            table.string('city', 100).nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.integer('popularity').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('sport_id').references('id').inTable('sports');
            table.foreign('country_id').references('id').inTable('open_countries');
            table.index('token');
            table.index('external_id');
        }),

        // Junction table for teams and leagues
        knex.schema.createTable('sports_teams_leagues', function(table) {
            table.increments('id').primary();
            table.integer('team_id').unsigned().notNullable();
            table.integer('league_id').unsigned().notNullable();
            table.integer('season').nullable();
            table.boolean('is_active').defaultTo(true);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('team_id').references('id').inTable('sports_teams');
            table.foreign('league_id').references('id').inTable('sports_leagues');

            table.unique(['team_id', 'league_id', 'season']);
            table.index(['league_id', 'season']);
        }),

        knex.schema.createTable('persons_sports_watch', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('sport_id').unsigned().notNullable();
            table.string('sport_token', 32).notNullable();
            table.string('level', 32).nullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('sport_id').references('id').inTable('sports');

            table.unique(['person_id', 'sport_id']);
        }),

        knex.schema.createTable('persons_sports_play', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('sport_id').unsigned().notNullable();
            table.string('sport_token', 32).notNullable();
            table.string('level', 32).nullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('sport_id').references('id').inTable('sports');

            table.unique(['person_id', 'sport_id']);
        }),

        knex.schema.createTable('persons_sports_teams', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('team_id').unsigned().notNullable();
            table.string('team_token', 32).notNullable();
            table.string('level', 32).nullable();
            table.boolean('is_favorite').defaultTo(false);
            table.integer('favorite_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();

            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('team_id').references('id').inTable('sports_teams');

            table.unique(['person_id', 'team_id']);
        }),
    ]);
};

exports.down = function(knex) {
    return Promise.all([
        knex.schema.dropTableIfExists('persons_sports_teams'),
        knex.schema.dropTableIfExists('persons_sports_play'),
        knex.schema.dropTableIfExists('persons_sports_watch'),
        knex.schema.dropTableIfExists('sports_teams_leagues'),
        knex.schema.dropTableIfExists('sports_teams'),
        knex.schema.dropTableIfExists('sports_leagues'),
        knex.schema.dropTableIfExists('sports_countries'),
        knex.schema.dropTableIfExists('sports')
    ]);
};