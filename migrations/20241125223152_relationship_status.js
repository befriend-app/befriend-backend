exports.up = function (knex) {
    return Promise.all([
        knex.schema.createTable('relationship_status', function (table) {
            table.increments('id').primary();
            table.string('token', 32).notNullable();
            table.string('name', 255).notNullable();
            table.integer('sort_position').notNullable();
            table.boolean('is_visible').defaultTo(1);
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
        }),

        knex.schema.createTable('persons_relationship_status', function (table) {
            table.bigIncrements('id').primary();
            table.bigInteger('person_id').unsigned().notNullable();
            table.integer('relationship_status_id').unsigned().notNullable();
            table.bigInteger('created').notNullable();
            table.bigInteger('updated').notNullable();
            table.bigInteger('deleted').nullable();
            table.foreign('person_id').references('id').inTable('persons');
            table.foreign('relationship_status_id').references('id').inTable('relationship_status');
        }),
    ]);
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('persons_relationship_status')
        .dropTableIfExists('relationship_status');
};
