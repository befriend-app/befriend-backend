exports.up = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.boolean('is_any').notNullable().defaultTo(false).after('is_negative');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.dropColumn('is_any');
    });
};
