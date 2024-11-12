/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('persons_schools', (table) => {
            table.string('school_token').nullable().after('school_id');
            table.string('hash_token').nullable().after('school_token');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('persons_schools', (table) => {
            table.dropColumn('school_token');
            table.dropColumn('hash_token');
        });
};
