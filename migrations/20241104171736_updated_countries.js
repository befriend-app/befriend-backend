/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

let tn = 'open_countries';

exports.up = async function (knex) {
    return knex.schema.alterTable(tn, (table) => {
        table.string('emoji').nullable().after('country_code');

        table.float('min_lat', 10, 4);
        table.float('max_lat', 10, 4);
        table.float('min_lon', 10, 4);
        table.float('max_lon', 10, 4);

        table.string('wiki_code').nullable();

        table.bigInteger('created').nullable();
        table.bigInteger('updated').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable(tn, (table) => {
        table.dropColumn('wiki_code');
        table.dropColumn('created');
        table.dropColumn('updated');
    });
};
