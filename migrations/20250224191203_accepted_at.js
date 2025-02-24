/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.alterTable('activities_persons', (table) => {
        table.bigInteger('accepted_at').nullable().after('is_creator');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.alterTable('activities_persons', (table) => {
        table.dropColumn('accepted_at');
    });
};
