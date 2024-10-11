/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('open_countries', table => {
        table.increments('id').unsigned().primary();

        table.string('country_name').notNullable();
        table.string('country_code').notNullable();

        table.integer('population').nullable();

        table.float('lat', 14, 10).nullable();
        table.float('lon', 14, 10).nullable();

        table.index('country_name');
    })
    .createTable('open_states', table => {
        table.increments('id').unsigned().primary();

        table.integer('country_id').unsigned().notNullable();

        table.string('state_name').notNullable();
        table.string('state_short').notNullable();

        table.integer('population').nullable();

        table.float('lat', 14, 10).nullable();
        table.float('lon', 14, 10).nullable();

        table.index('state_name');

        table.foreign('country_id').references('id').inTable('open_countries');
    })
        .createTable('open_cities', table => {
            table.increments('id').unsigned().primary();

            table.integer('country_id').unsigned().notNullable();
            table.integer('state_id').unsigned().nullable();

            table.string('city_name').notNullable();
            table.string('postcode').nullable();

            table.integer('population').nullable();

            table.float('lat', 14, 10).nullable();
            table.float('lon', 14, 10).nullable();

            table.boolean('is_city').defaultTo(0);
            table.boolean('is_town').defaultTo(0);
            table.boolean('is_village').defaultTo(0);
            table.boolean('is_hamlet').defaultTo(0);
            table.boolean('is_administrative').defaultTo(0);

            table.foreign('country_id').references('id').inTable('open_countries');
            table.foreign('state_id').references('id').inTable('open_states');

        })
    .createTable('open_addresses', table => {
        table.bigIncrements('id').unsigned().primary();

        table.string('hash').notNullable();
        table.string('number').nullable();
        table.string('street').nullable();
        table.string('unit').nullable();

        table.integer('country_id').unsigned().notNullable();
        table.integer('state_id').unsigned().notNullable();
        table.integer('city_id').unsigned().notNullable();

        // table.string('city').nullable();
        // table.string('district').nullable();
        // table.string('region').nullable();
        // table.string('postcode').nullable();
        // table.string('country_code').nullable();
        // table.string('country_name').nullable();

        table.float('lat', 14, 10).nullable();
        table.float('lon', 14, 10).nullable();

        let indexes = [
            'hash', 'number', 'street', 'unit'
        ];

        for(let index of indexes) {
            table.index(index);
        }

        table.foreign('country_id').references('id').inTable('open_countries');
        table.foreign('state_id').references('id').inTable('open_states');
        table.foreign('city_id').references('id').inTable('open_cities');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('open_addresses')
        .dropTable('open_cities')
        .dropTable('open_states')
        .dropTable('open_countries');
};