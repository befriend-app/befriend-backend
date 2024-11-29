/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('movies', (table) => {
        table.integer('vote_count').nullable().after('release_date');
        table.float('vote_average', 10, 4).nullable().after('vote_count');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('movies', (table) => {
        table.dropColumn('vote_count');
        table.dropColumn('vote_average');
    });
};
