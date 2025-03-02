/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasColumn1 = await knex.schema.hasColumn('activities_persons', 'activity_started');
    const hasColumn2 = await knex.schema.hasColumn('activities', 'is_cancelled');

    if (hasColumn1) {
        await knex.schema.alterTable('activities_persons', (table) => {
            table.dropColumn('activity_started');
        });
    }

    if (hasColumn2) {
        await knex.schema.alterTable('activities', (table) => {
            table.dropColumn('is_cancelled');
        });
    }

    await knex.schema.alterTable('activities', (table) => {
        table.boolean('started_at').nullable().after('persons_qty');
        table.bigInteger('cancelled_at').nullable().after('started_at');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('activities', (table) => {
        table.dropColumn('started_at');
        table.dropColumn('cancelled_at');
    });
};
