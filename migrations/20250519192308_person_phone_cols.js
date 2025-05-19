/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.string('phone_country_code').nullable().after('phone').index();
        table.string('phone').alter().index();


    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropColumn('phone_country_code');
        table.dropIndex('phone');
    });
};
