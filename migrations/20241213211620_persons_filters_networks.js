exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('persons_filters_networks');

    return knex.schema.createTable('persons_filters_networks', (table) => {
        table.increments('id').primary();
        table.bigInteger('person_id').unsigned().notNullable().references('id').inTable('persons');
        table.integer('network_id').unsigned().nullable().references('id').inTable('networks');

        table.boolean('is_all_verified').notNullable().defaultTo(true);
        table.boolean('is_any_network').notNullable().defaultTo(false);
        table.boolean('is_active').nullable();
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('person_id');
        table.index('network_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('persons_filters_networks');
};
