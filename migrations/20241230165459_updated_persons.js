/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.boolean('is_new').defaultTo(false).after('person_token');
        table.boolean('is_online').defaultTo(false).after('is_new').alter();
        table.boolean('is_verified_in_person').defaultTo(false).after('is_online').alter();
        table.boolean('is_verified_linkedin').defaultTo(false).after('is_verified_in_person').alter();
        table.boolean('is_blocked').defaultTo(false).after('is_verified_linkedin').alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('is_new');
    });
};
