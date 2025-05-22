exports.up = function(knex) {
    return knex.schema.alterTable('persons', table => {
        table.string('oauth_provider', 100)
            .nullable().after('last_name').index();

        table.string('oauth_id')
            .nullable().after('oauth_provider').index();

        table.boolean('is_account_confirmed')
            .defaultTo(false).after('image_url');
    });
};

exports.down = function(knex) {
    return knex.schema.alterTable('persons', table => {
        table.dropColumn('oauth_provider');
        table.dropColumn('oauth_id');
        table.dropColumn('is_account_confirmed');
    });
};