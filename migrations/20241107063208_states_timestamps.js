/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    return knex.schema
        .alterTable('open_states', (table) => {
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        })
        .alterTable('open_cities', (table) => {
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('open_states', (table) => {
            table.dropColumn('created');
            table.dropColumn('updated');
            table.dropColumn('deleted');
        })
        .alterTable('open_cities', (table) => {
            table.dropColumn('created');
            table.dropColumn('updated');
            table.dropColumn('deleted');
        });
};
