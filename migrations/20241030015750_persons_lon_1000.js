/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('persons', (table) => {
        table.mediumint('location_lon_1000').nullable().after('location_lon');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('persons', (table) => {
        table.dropColumn('location_lon_1000');
    });
};
