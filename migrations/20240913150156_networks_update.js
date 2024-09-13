/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks', table => {
        table.boolean('is_blocked').notNullable().defaultTo(false)
            .after('is_trusted');

        table.string('admin_name').nullable().alter();
        table.string('admin_email').nullable().alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.table('networks', table => {
        table.dropColumn('is_blocked');
    });
};
