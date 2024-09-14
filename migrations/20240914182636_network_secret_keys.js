/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('networks_secret_keys', table => {
        table.dropColumn('secret_key');

        table.string('secret_key_from', 255).notNullable();
        table.string('secret_key_to', 255).notNullable();

        table.index('secret_key_from', 'secrets_secret_key_from_index');
        table.index('secret_key_to', 'secrets_secret_key_to_index');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
