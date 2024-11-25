exports.up = function(knex) {
    return Promise.all([
        knex.schema.createTable('life_stages', function(table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable();
            table.string('name', 255).notNullable();
            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(1);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('persons_life_stages', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('life_stage_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('life_stage_id').references('id').inTable('life_stages');
        })
    ]);
};

exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('persons_life_stages')
        .dropTableIfExists('life_stages');
};