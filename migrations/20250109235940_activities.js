/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('activities_persons', (table) => {
        table.boolean('is_creator').defaultTo(false).after('person_id');
        table.boolean('activity_started').defaultTo(false).after('is_creator');

        table.bigInteger('arrived_at').nullable().alter();
        table.bigInteger('cancelled_at').nullable().alter();

        table.bigInteger('left_at').nullable().after('cancelled_at');
    });

    await knex.schema.createTable('activities_notifications', (table) => {
        table.increments('id').primary();

        table
            .bigInteger('activity_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('activities');

        table
            .bigInteger('person_from_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('persons');
        table
            .bigInteger('person_to_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('persons');
        table
            .integer('person_to_network_id')
            .unsigned()
            .nullable()
            .references('id')
            .inTable('networks');

        table.boolean('is_success').defaultTo(false);
        table.boolean('is_failed').defaultTo(false);

        table.bigInteger('sent_at').notNullable();
        table.bigInteger('accepted_at').nullable();
        table.bigInteger('declined_at').nullable();
        table.bigInteger('cancelled_at').nullable();

        table.bigInteger('sent_to_network_at').nullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('activity_id');
        table.index('person_from_id');
        table.index('person_to_id');
        table.index('person_to_network_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('activities_notifications');

    await knex.schema.alterTable('activities_persons', (table) => {
        table.dropColumn('is_creator');
        table.dropColumn('activity_started');
        table.dropColumn('left_at');
    });
};
