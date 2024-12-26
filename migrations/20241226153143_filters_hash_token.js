/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.string('hash_token').nullable().after('filter_value_max');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.dropColumn('hash_token');
    });
};
