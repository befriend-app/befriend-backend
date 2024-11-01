/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.string('notification_name').notNullable().after('activity_title');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.dropColumn('notification_name');
    });
};
