/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    return knex.schema
        .alterTable('reviews', (table) => {
            table
                .float('sort_position', 8, 2)
                .notNullable()
                .defaultTo(0)
                .after('review_name')
                .alter();
        })
        .alterTable('verifications', (table) => {
            table.float('verification_name', 8, 2).notNullable().after('id').alter();
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {};
