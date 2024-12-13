/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.alterTable('networks', (table) => {
        table
            .boolean('is_active')
            .defaultTo(false)
            .notNullable()
            .after('is_online');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.alterTable('networks', (table) => {
        table.dropColumn('is_active');
    });
};
