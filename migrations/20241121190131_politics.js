exports.up = function(knex) {
    return Promise.all([
        knex.schema.createTable('politics', function(table) {
            table.increments('id').primary();
            table.string('token').notNullable();
            table.string('name', 255).notNullable();
            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(1);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('persons_politics', function(table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('politics_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('politics_id').references('id').inTable('politics');
        })
    ]);
};

exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('persons_politics')
        .dropTableIfExists('politics');
};