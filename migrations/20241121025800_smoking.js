/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .createTable('smoking', (table) => {
                table.increments('id').primary();
                table.string('token').notNullable();
                table.string('name', 255).notNullable();
                table.integer('sort_position').notNullable();
                table.boolean('is_visible').defaultTo(1);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();
            })
            .createTable('persons_smoking', (table) => {
                table.bigIncrements('id').primary();

                table.bigInteger('person_id').unsigned().notNullable();
                table.integer('smoking_id').unsigned().notNullable();

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.foreign('person_id').references('id').inTable('persons');
                table.foreign('smoking_id').references('id').inTable('smoking');
            });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return knex.schema.dropTableIfExists('persons_smoking').dropTableIfExists('smoking');
};