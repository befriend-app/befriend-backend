/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks_secret_keys', table => {
        table.string('secret_key_from', 255).notNullable()
            .after('is_active').alter();

        table.string('secret_key_to', 255).notNullable()
            .after('secret_key_from').alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
