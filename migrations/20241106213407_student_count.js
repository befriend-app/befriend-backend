/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {

    return knex.schema.alterTable('schools', (table) => {
        table.integer('student_count').nullable().after('country_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('schools', (table) => {
        table.dropForeign('student_count');
    });
};
