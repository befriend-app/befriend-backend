/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.alterTable('activities', (table) => {
        table.float('location_lat', 10, 4).notNullable().alter();
        table.float('location_lon', 10, 4).notNullable().alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
