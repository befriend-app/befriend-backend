/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .createTable('drinking', (table) => {
                table.increments('id').primary();
                table.string('token').notNullable();
                table.string('name', 255).notNullable();
                table.integer('sort_position').notNullable();
                table.boolean('is_visible').defaultTo(1);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();
            })
            .createTable('persons_drinking', (table) => {
                table.bigIncrements('id').primary();

                table.bigInteger('person_id').unsigned().notNullable();
                table.integer('drinking_id').unsigned().notNullable();

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.foreign('person_id').references('id').inTable('persons');
                table.foreign('drinking_id').references('id').inTable('drinking');
            });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return knex.schema.dropTableIfExists('persons_drinking').dropTableIfExists('drinking');
};
