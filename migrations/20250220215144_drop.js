exports.up = async function(knex) {
    const hasColumn = await knex.schema.hasColumn('activities', 'access_token');

    if(hasColumn) {
        await knex.schema.alterTable('activities', (table) => {
            table.dropColumn('access_token');
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
};
