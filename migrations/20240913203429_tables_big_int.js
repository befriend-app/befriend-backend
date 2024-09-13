/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    let tables = [
        'persons_reviews',
        'persons_companies',
        'persons_networks',
        'persons_schools',
        'persons_verifications',
        'persons_login_tokens',
        'persons_friends_circles',
        'persons_friends',
        'persons_circles',
        'persons_filters',
        'persons_industries',
        'activities_persons',
        'activities_filters',
        'filters',
        'activities',
        'activity_types',
        'persons',
        'verifications',
        'reviews',
        'industries',
        'companies',
        'schools',
        'genders',
        'networks_secret_keys',
        'networks'
    ];

    for(let table_name of tables) {
        await knex.schema.alterTable(table_name, table => {
            table.bigint('created').notNullable().alter();
            table.bigint('updated').notNullable().alter();
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  
};
