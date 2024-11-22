/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    let has_old_city_col = await knex.schema.hasColumn('schools', 'city');

    return knex.schema.alterTable('schools', (table) => {
        if (has_old_city_col) {
            table.dropColumn('city');
            table.dropColumn('state');
        }

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
    return knex.schema.alterTable('schools', (table) => {
        table.dropColumn('city_id');
        table.dropColumn('state_id');
    });
};
