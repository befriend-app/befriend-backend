/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('activities_persons_reviews', (table) => {
        table.boolean('is_synced').defaultTo(0).after('rating');

        table.index('is_synced');
        table.index('updated');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('activities_persons_reviews', (table) => {
       table.dropIndex('is_synced');
       table.dropIndex('updated');

       table.dropColumn('is_synced');
    });
};
