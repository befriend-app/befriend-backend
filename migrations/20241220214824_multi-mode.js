/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('persons', 'mode_id');

    if (hasColumn) {
        await knex.schema.alterTable('persons', (table) => {
            table.renameColumn('mode_id', 'current_mode_id');
        });
    }

    await knex.schema.alterTable('persons', (table) => {
        table.string('modes').nullable().after('person_token');
    });

    await knex.schema.alterTable('activities', (table) => {
        table
            .integer('mode_id')
            .unsigned()
            .notNullable()
            .after('activity_type_id')
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
        table.dropColumn('modes');
    });

    await knex.schema.alterTable('activities', (table) => {
        table.dropForeign('mode_id');
        table.dropColumn('mode_id');
    });
};
