/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

let tn = 'persons_schools';

exports.up = async function(knex) {
    return knex.schema.alterTable(tn, (table) => {
        table.integer('year_from').nullable().alter();
        table.string('year_to').nullable().alter();

        table.bigInteger('deleted').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable(tn, (table) => {
        table.dropColumn('deleted');
    });
};
