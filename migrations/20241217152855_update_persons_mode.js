/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('persons', 'mode');

    if (hasColumn) {
        await knex.schema.alterTable('persons', (table) => {
            table.dropColumn('mode');
        });
    }

    await knex.schema.alterTable('persons', (table) => {
        table
            .integer('mode_id')
            .unsigned()
            .nullable()
            .after('person_token')
            .references('id')
            .inTable('modes');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('mode_id');
    });
};
