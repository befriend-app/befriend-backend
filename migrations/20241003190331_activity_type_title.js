/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.string('activity_title').notNullable().after('activity_name_full');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.dropColumn('activity_title');
    });
};
