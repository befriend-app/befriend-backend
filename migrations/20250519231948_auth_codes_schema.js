/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('auth_codes');

    await knex.schema.createTable('auth_codes', (table) => {
        table.bigIncrements('id').unsigned().primary();

        table.string('phone', 30).nullable().index();
        table.string('email', 100).nullable().index();
        table.string('code', 20).index();
        table.string('action', 30).notNullable();
        table.boolean('is_used').defaultTo(false);
        table.integer('errors').defaultTo(0);

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('auth_codes');
};
