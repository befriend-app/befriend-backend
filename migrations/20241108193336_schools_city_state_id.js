/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('schools', (table) => {
            table.integer('city_id').unsigned().nullable().after('country_id');
            table.integer('state_id').unsigned().nullable().after('city_id');

            table.foreign('city_id').references('id').inTable('open_cities');
            table.foreign('state_id').references('id').inTable('open_states');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('schools', (table) => {
            table.dropColumn('city_id');
            table.dropColumn('state_id');
        });
};
