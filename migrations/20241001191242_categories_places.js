/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('categories_geo', table => {
        table.bigIncrements('id').unsigned().primary();

        table.string('categories_key').notNullable().comment("One or more venue_category_id separated by commas, ordered from lowest to highest");
        table.integer('search_radius_meters').notNullable();

        table.float('location_lat', 14, 10).notNullable();
        table.float('location_lat_min', 14, 10).notNullable();
        table.float('location_lat_max', 14, 10).notNullable();

        table.float('location_lon', 14, 10).notNullable();
        table.float('location_lon_min', 14, 10).notNullable();
        table.float('location_lon_max', 14, 10).notNullable();

        table.mediumint('location_lat_1000').notNullable();
        table.mediumint('location_lat_min_1000').notNullable();
        table.mediumint('location_lat_max_1000').notNullable();

        table.mediumint('location_lon_1000').notNullable();
        table.mediumint('location_lon_min_1000').notNullable();
        table.mediumint('location_lon_max_1000').notNullable();

        table.bigInteger('expires').notNullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        let indexes = [
                'categories_key', 'location_lat', 'location_lat_1000', 'location_lon', 'location_lon_1000',
                'location_lat_min', 'location_lat_min_1000', 'location_lon_min', 'location_lon_min_1000',
                'location_lat_max', 'location_lat_max_1000', 'location_lon_max', 'location_lon_max_1000',
            ];

        for(let index of indexes) {
            table.index(index);
        }
    }).createTable('places', table => {
        table.bigIncrements('id').unsigned().primary();

        table.string('fsq_place_id').notNullable();

        table.string('name').notNullable();

        table.string('business_open').nullable();

        table.float('location_lat', 14, 10).notNullable();
        table.mediumint('location_lat_1000').notNullable();
        table.float('location_lon', 14, 10).notNullable();
        table.mediumint('location_lon_1000').notNullable();

        table.string('hours', 1000).nullable();

        table.string('hours_popular', 1000).nullable();

        table.string('location_address').nullable();
        table.string('location_address_2').nullable();
        table.string('location_locality').nullable();
        table.string('location_postcode').nullable();
        table.string('location_region').nullable();
        table.string('location_country').nullable();

        table.float('popularity', 10, 8).nullable();

        table.integer('price').nullable();

        table.float('rating', 7, 4).nullable();

        table.string('reality').nullable();

        table.string('timezone').notNullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
    }).createTable('categories_geo_places', table => {
        table.bigIncrements('id').unsigned().primary();

        table.bigInteger('category_geo_id').unsigned().notNullable();

        table.bigInteger('place_id').unsigned().notNullable();

        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();

        table.foreign('category_geo_id').references('id').inTable('categories_geo');
        table.foreign('place_id').references('id').inTable('places');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('categories_geo_places')
      .dropTable('places')
      .dropTable('categories_geo');
};
