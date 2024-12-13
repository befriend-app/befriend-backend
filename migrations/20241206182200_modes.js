exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('modes');

    await knex.schema.createTable('modes', (table) => {
        table.increments('id').primary();
        table.string('token').notNullable().unique();
        table.string('name').notNullable();
        table.integer('sort_position').notNullable().defaultTo(0);
        table.boolean('is_visible').notNullable().defaultTo(true);
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();
    });

    await knex.schema.alterTable('persons_filters', (table) => {
        table
            .integer('mode_id')
            .unsigned()
            .nullable()
            .after('filter_value_max')
            .references('id')
            .inTable('modes');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.dropForeign('mode_id');
        table.dropColumn('mode_id');
    });

    await knex.schema.dropTableIfExists('modes');
};
