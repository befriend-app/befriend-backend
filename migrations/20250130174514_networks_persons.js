/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.dropTableIfExists('persons_networks');

    // await knex.schema.createTable('networks_persons', (table) => {
    //     table.bigIncrements('id').unsigned().primary();
    //     table.integer('network_id').unsigned().notNullable();
    //     table.bigInteger('person_id').unsigned().notNullable();
    //     table.boolean('is_active').defaultTo(true).notNullable();
    //
    //     table.integer('created').notNullable();
    //     table.integer('updated').notNullable();
    //     table.integer('deleted').nullable();
    //
    //     table.index('network_id');
    //     table.index('person_id');
    //
    //     table.foreign('network_id').references('id').inTable('networks');
    //     table.foreign('person_id').references('id').inTable('persons');
    // });
    //
    // const hasColumn = await knex.schema.hasColumn('persons', 'network_id');
    //
    // if (hasColumn) {
    //     await knex.schema.alterTable('persons', (table) => {
    //         table.dropForeign('network_id');
    //         table.dropColumn('network_id');
    //     });
    // }

    await knex.schema.alterTable('persons', (table) => {
        table.integer('registration_network_id').unsigned().notNullable().after('id').comment('First network person registered with');
        table.foreign('registration_network_id').references('id').inTable('networks');
    });

    //used for joining additional networks
    await knex.schema.createTable('networks_persons_registration', (table) => {
        table.bigIncrements('id').unsigned().primary();
        table.integer('network_from_id').unsigned().notNullable();
        table.integer('network_to_id').unsigned().notNullable();
        table.string('person_token').notNullable();
        table.string('registration_token').nullable();
        table.boolean('is_success').defaultTo(false).notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();
        table.integer('deleted').nullable();

        table.index('network_from_id');
        table.index('network_to_id');
        table.index('person_token');

        table.foreign('network_from_id').references('id').inTable('networks');
        table.foreign('network_to_id').references('id').inTable('networks');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('networks_persons');
    await knex.schema.dropTableIfExists('networks_persons_registration');

    await knex.schema.alterTable('persons', (table) => {
        table.dropForeign('registration_network_id');
        table.dropColumn('registration_network_id');
    });
};
