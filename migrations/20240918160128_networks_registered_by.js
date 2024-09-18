/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks', table => {
        table.bigInteger('registration_network_id').unsigned().nullable()
            .after('id');

        table.foreign('registration_network_id').references('id').inTable('networks');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
