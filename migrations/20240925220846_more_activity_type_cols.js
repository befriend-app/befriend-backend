/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

let bools = [
    'meet',
    'eat',
    'drink',
    'walk',
    'exercise',
    'watch',
    'fun',
    'dance',
    'attend',
    'relax',
    'discover',
    'travel',
    'shop',
    'kids',
];

exports.up = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        let prev = 'is_visible';

        for (let col of bools) {
            table.boolean(`is_${col}`).defaultTo(0).after(prev);
            prev = `is_${col}`;
        }
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('activity_types', (table) => {
        for (let col of bools) {
            table.dropColumn(`is_${col}`);
        }
    });
};
