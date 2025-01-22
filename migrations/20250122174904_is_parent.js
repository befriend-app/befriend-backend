exports.up = async function(knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.boolean('is_parent').notNullable().defaultTo(false).after('filter_id');
    });
};

exports.down = async function(knex) {
    await knex.schema.alterTable('persons_filters', (table) => {
        table.dropColumn('is_parent');
    });
};
