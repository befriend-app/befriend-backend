/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('music_genres', (table) => {
        table.string('mb_genres').nullable().after('apple_id');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('music_genres', (table) => {
        table.dropColumn('mb_genres');
    });
};
