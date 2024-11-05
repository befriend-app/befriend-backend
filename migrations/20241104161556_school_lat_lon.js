/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    let has_country_col = await knex.schema.hasColumn('schools', 'country');

    let has_school_token_col = await knex.schema.hasColumn('schools', 'school_token');
    let has_school_name_col = await knex.schema.hasColumn('schools', 'school_name');

    return knex.schema.alterTable('schools', (table) => {
        if(has_country_col) {
            table.dropColumn('country');
        }

        if(has_school_token_col) {
            table.renameColumn('school_token', 'token');
        }

        if(has_school_name_col) {
            table.renameColumn('school_name', 'name');
        }

        table.integer('country_id').unsigned().notNullable().after('state');

        table.float('lat', 14, 10).nullable().after('country_id');
        table.float('lon', 14, 10).nullable().after('lat');

        table.bigInteger('deleted').nullable();

        table.foreign('country_id').references('id').inTable('open_countries');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('schools', (table) => {
        table.dropForeign('country_id');
        table.dropColumn('country_id');
        table.dropColumn('lat');
        table.dropColumn('lon');
        table.dropColumn('deleted');
    });
};
