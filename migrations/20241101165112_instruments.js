/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .createTable('instruments', (table) => {
                table.increments('id').primary();
                table.string('token').notNullable();
                table.string('name', 255).notNullable();
                table.integer('popularity').notNullable();

                table.boolean('is_common').defaultTo(false);

                table
                    .enum('category', [
                        'String',
                        'Wind',
                        'Brass',
                        'Percussion',
                        'Keyboard',
                        'Electronic',
                        'Natural',
                    ])
                    .notNullable();

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();

                table.index('name');
            })
            .createTable('persons_instruments', (table) => {
                table.bigIncrements('id').primary();

                table.bigInteger('person_id').unsigned().notNullable();
                table.integer('instrument_id').unsigned().notNullable();
                table.enum('skill_level', [
                    'Beginner',
                    'Intermediate',
                    'Advanced',
                    'Expert',
                    'Virtuoso',
                ]);

                table.bigInteger('created').notNullable();
                table.bigInteger('updated').notNullable();
                table.bigInteger('deleted').nullable();

                table.foreign('person_id').references('id').inTable('persons');
                table.foreign('instrument_id').references('id').inTable('instruments');
            });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return knex.schema.dropTableIfExists('persons_instruments').dropTableIfExists('instruments');
};
