/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.boolean('is_verified_in_person').defaultTo(false).notNullable().after('network_id');
        table
            .boolean('is_verified_linkedin')
            .defaultTo(false)
            .notNullable()
            .after('is_verified_in_person');
        table.integer('age').nullable().after('reviews_rating');
        table.boolean('is_blocked').defaultTo(false).notNullable().after('birth_date');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('is_verified_in_person');
        table.dropColumn('is_verified_linkedin');
        table.dropColumn('age');
        table.dropColumn('is_blocked');
    });
};
