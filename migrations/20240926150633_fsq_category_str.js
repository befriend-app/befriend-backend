/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('venues_categories', table => {
        table.string(`fsq_id_str`).nullable().after(`fsq_id`);

        table.index('fsq_id_str', 'venues_categories_fsq_id_str_index');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.alterTable('venues_categories', table => {
        table.dropColumn('fsq_id_str');
    });
};
