/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('persons', (table) => {
        table.string('first_name').nullable().after('network_id');

        table.string('last_name').nullable().after('first_name');

        table.dropColumn('person_name');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
