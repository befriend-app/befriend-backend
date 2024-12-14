/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('networks', (table) => {
        table.boolean('is_active').defaultTo(false).notNullable().after('is_online');
        table.bigInteger('persons_count').defaultTo(0).notNullable().after('keys_exchanged');
    });

    await knex.schema.alterTable('persons_networks', (table) => {
        table.bigInteger('deleted').nullable().after('updated');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons_networks', (table) => {
        table.dropColumn('deleted');
    });

    await knex.schema.alterTable('networks', (table) => {
        table.dropColumn('is_active');
        table.dropColumn('persons_count');
    });
};
