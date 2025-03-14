/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('persons', (table) => {
            table.string('mode').nullable().after('person_token');
            table.boolean('is_online').notNullable().after('mode').alter();
        })
        .createTable('persons_partner', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('gender_id').unsigned().nullable();
            table.string('token').notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('gender_id').references('id').inTable('genders');

            table.index('token');
        })
        .createTable('kids_ages', (table) => {
            table.increments('id').primary();
            table.string('token').notNullable();
            table.string('name').notNullable();
            table.integer('age_min').notNullable();
            table.integer('age_max').notNullable();
            table.boolean('is_visible').defaultTo(true);
            table.integer('sort_position').nullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        })
        .createTable('persons_kids', (table) => {
            table.bigIncrements('id').primary();
            table.string('token').notNullable();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('age_id').unsigned().nullable();
            table.integer('gender_id').unsigned().nullable();
            table.boolean('is_active').defaultTo(true);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('age_id').references('id').inTable('kids_ages');
            table.foreign('gender_id').references('id').inTable('genders');

            table.index('token');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    knex.schema.alterTable('persons', (table) => {
        table.dropColumn('mode');
    });
};
