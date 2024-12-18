/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.createTable('earth_grid', (table) => {
        table.increments('id').primary();

        table.string('token', 32).notNullable();
        table.integer('lat_key').notNullable();
        table.integer('lon_key').notNullable();
        table.decimal('center_lat', 7, 3);
        table.decimal('center_lon', 7, 3);
        table.decimal('grid_size_km', 5,1);

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();

        table.index('token');
        table.index('lat_key');
        table.index('lon_key');
        table.index('updated');
    });

    await knex.schema.alterTable('persons', (table) => {
        table.integer('grid_id').unsigned().nullable().after('network_id').references('id').inTable('earth_grid');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('persons', (table) => {
        table.dropForeign('grid_id');
        table.dropColumn('grid_id');
    });

    await knex.schema.dropTableIfExists('earth_grid');
};
