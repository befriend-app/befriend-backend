let table_name = 'persons_devices';

exports.up = function (knex) {
    return knex.schema.createTable(table_name, (table) => {
        table.increments('id').primary();
        table.bigInteger('person_id').unsigned().notNullable();

        table.string('token', 255).notNullable();

        table.enum('platform', ['ios', 'android']).notNullable();

        table.boolean('is_current').defaultTo(false);

        table.bigInteger('last_updated').notNullable();
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        // Indexes
        table.index('person_id');
        table.index('token');
        table.index('platform');
        table.index('is_current');

        table.foreign('person_id').references('id').inTable('persons');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists(table_name);
};
