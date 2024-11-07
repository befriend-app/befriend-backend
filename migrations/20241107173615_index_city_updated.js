/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .alterTable('open_cities', (table) => {
                table.index('updated');
            })
            .alterTable('schools', (table) => {
                table.index('updated');
            });

        resolve();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return new Promise(async (resolve, reject) => {
        await knex.schema
            .alterTable('open_cities', (table) => {
                table.dropIndex('updated');
            })
            .alterTable('schools', (table) => {
                table.dropIndex('updated');
            });

        resolve();
    });
};
