/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('activities_persons', (table) => {
        table.string('access_token').nullable().after('left_at');
        table.string('first_name').nullable().after('access_token');
        table.string('image_url').nullable().after('first_name');

        table.index('access_token');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('activities_persons', (table) => {
        table.dropIndex('access_token');

        table.dropColumn('access_token');
        table.dropColumn('first_name');
        table.dropColumn('image_url');
    });
};
