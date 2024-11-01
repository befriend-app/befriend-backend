/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        table.dropColumn('activity_icon');

        table.text('activity_image').nullable().after('activity_name');

        table.string('activity_emoji').nullable().after('activity_image');

        table.string('activity_name_full').notNullable().after('activity_name');

        table.integer('parent_activity_type_id').unsigned().nullable().after('id').alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
