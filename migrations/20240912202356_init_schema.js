/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    //create database if not exists
    return knex.schema.createTable('networks', table => {
        table.bigIncrements('id').unsigned().primary();
        table.string('network_token', 255).notNullable();
        table.string('network_name', 255).notNullable();
        table.string('network_logo', 255).nullable();
        table.string('api_domain', 255).nullable();
        table.boolean('is_befriend').notNullable().defaultTo(false);
        table.boolean('is_trusted').notNullable().defaultTo(false);
        table.string('admin_name', 255).notNullable();
        table.string('admin_email', 255).notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.index('network_token', 'networks_network_token_index');
    })
    .createTable('networks_secret_keys', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('network_id').unsigned().notNullable();
        table.string('secret_key', 255).notNullable();
        table.boolean('is_active').notNullable().defaultTo(0);

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('network_id').references('id').inTable('networks');
    })
    .createTable('genders', table => {
        table.increments('id').unsigned().primary();
        table.string('gender_token', 255).notNullable();
        table.string('gender_name', 255).notNullable();
        table.float('sort_position').notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.index('gender_token', 'genders_gender_token_index');
    })
    .createTable('schools', table => {
        table.increments('id').unsigned().primary();
        table.string('school_token', 255).notNullable();
        table.string('school_name', 255).notNullable();
        table.string('city', 255).nullable();
        table.string('state', 255).nullable();
        table.string('country', 255).nullable();
        table.boolean('is_grade_school').notNullable().defaultTo(false);
        table.boolean('is_high_school').notNullable().defaultTo(false);
        table.boolean('is_college').notNullable().defaultTo(false);

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.index('school_token', 'schools_school_token_index');
    })
    .createTable('companies', table => {
        table.increments('id').unsigned().primary();
        table.string('company_token', 255).notNullable();
        table.string('company_name', 255).notNullable();
        table.string('company_website', 255).nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.index('company_token', 'companies_company_token_index');
    })
    .createTable('industries', table => {
        table.increments('id').unsigned().primary();
        table.string('industry_token', 255).notNullable();
        table.string('industry_name', 255).notNullable();
        table.integer('parent_industry_id').unsigned().nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('parent_industry_id').references('id').inTable('industries');
        table.index('industry_token', 'industries_industry_token_index');
    })
    .createTable('reviews', table => {
        table.increments('id').unsigned().primary();
        table.string('review_name', 255).notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.decimal('sort_position', 8, 2).notNullable().defaultTo(0);
    })
    .createTable('verifications', table => {
        table.increments('id').unsigned().primary();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.string('verification_name', 255).notNullable();
    })
    .createTable('persons', table => {
        table.bigIncrements('id').unsigned().primary();
        table.string('person_token', 255).notNullable().comment('Unique identifier system wide');
        table.bigInteger('network_id').unsigned().notNullable().comment('Network person signed up on originally');
        table.string('person_name', 255).nullable();
        table.integer('gender_id').unsigned().nullable();
        table.string('email', 255).nullable();
        table.string('password', 255).nullable();
        table.string('phone', 255).nullable();
        table.boolean('is_online').notNullable().defaultTo(false);
        table.string('image_url', 255).nullable();
        table.float('location_lat', 14, 10).nullable();
        table.float('location_lon', 14, 10).nullable();
        table.integer('reviews_count').unsigned().notNullable().defaultTo(0).comment('Aggregated from persons_reviews');
        table.float('reviews_rating', 53).notNullable().comment('Aggregated from persons_reviews');
        table.date('birth_date').nullable();
        table.foreign('gender_id').references('id').inTable('genders');
        table.foreign('network_id').references('id').inTable('networks');

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.index('person_token', 'persons_person_token_index');
    })
    .createTable('activity_types', table => {
        table.increments('id').unsigned().primary();
        table.string('activity_type_token', 255).notNullable().comment('Unique system-wide');
        table.string('activity_name', 255).notNullable();
        table.string('activity_icon', 255).notNullable();
        table.integer('parent_activity_type_id').unsigned().nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('parent_activity_type_id').references('id').inTable('activity_types');
    })
    .createTable('activities', table => {
        table.bigIncrements('id').unsigned().primary();
        table.string('activity_token', 255).notNullable().comment('Unique across system');
        table.integer('activity_type_id').unsigned().notNullable();
        table.bigInteger('person_id').unsigned().notNullable().comment('Person that created the activity');
        table.float('location_lat', 14, 10).notNullable();
        table.float('location_lon', 14, 10).notNullable();
        table.string('location_name', 255).notNullable();
        table.integer('activity_start').notNullable().comment('Unix timestamp of approximate activity start time');
        table.integer('activity_duration_min').notNullable().comment('Approximate duration of activity in minutes');
        table.boolean('no_end_time').notNullable().defaultTo(false);
        table.integer('number_persons').notNullable();
        table.bigInteger('is_public').notNullable().defaultTo(1).comment('Whether location selected is a public setting.');
        table.boolean('is_new_friends').notNullable().defaultTo(false);
        table.boolean('is_existing_friends').notNullable().defaultTo(false);
        table.boolean('custom_filters').notNullable().defaultTo(false);

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('activity_type_id').references('id').inTable('activity_types');
        table.foreign('person_id').references('id').inTable('persons');
        table.index('activity_token', 'activities_activity_token_index');
    })
    .createTable('filters', table => {
        table.increments('id').unsigned().primary();
        table.string('filter_token', 255).notNullable().comment('Unique system-wide');
        table.string('filter_name', 255).notNullable();
        table.float('sort_position', 53).notNullable().defaultTo(0);
        table.integer('parent_filter_id').unsigned().nullable();
        table.boolean('is_distance').notNullable().defaultTo(false);
        table.boolean('is_language').notNullable().defaultTo(false);
        table.boolean('is_gender').notNullable().defaultTo(false);
        table.boolean('is_age').notNullable().defaultTo(false).comment('Linked to persons birth_date');
        table.boolean('is_school').notNullable().defaultTo(false);
        table.boolean('is_company').notNullable().defaultTo(false);
        table.boolean('is_industry').notNullable().defaultTo(false);
        table.boolean('is_review_timeliness').notNullable().defaultTo(false);
        table.boolean('is_music').notNullable().defaultTo(false);
        table.boolean('is_movie').notNullable().defaultTo(false);
        table.boolean('is_sports').notNullable().defaultTo(false);
        table.boolean('is_food').notNullable().defaultTo(false);
        table.boolean('is_hobby').notNullable().defaultTo(false);
        table.boolean('is_book').notNullable().defaultTo(false);
        table.boolean('is_birth_city').notNullable().defaultTo(false).comment('Person born in Toronto could find other persons born in Toronto wherever they\'re located.');
        table.boolean('is_birth_country').notNullable().defaultTo(false);
        table.boolean('is_home_city').notNullable().defaultTo(false).comment('Person who lives in London, visiting Chicago, could filter for other persons who live in London that are currently in Chicago.');
        table.boolean('is_home_country').notNullable().defaultTo(false);
        table.boolean('is_review_friendliness').notNullable().defaultTo(false);
        table.boolean('is_review_fun').notNullable().defaultTo(false);
        table.boolean('is_verification_linkedin').notNullable().defaultTo(false);
        table.boolean('is_verification_dl').notNullable().defaultTo(false).comment('Driver\'s license');
        table.boolean('is_verification_cc').notNullable().defaultTo(false).comment('Credit card');
        table.boolean('is_verification_video').notNullable().defaultTo(false);
        table.boolean('is_verification_in_person').notNullable().defaultTo(false);
        table.boolean('is_verification_mailer').notNullable().defaultTo(false);
        table.boolean('is_custom').notNullable().defaultTo(false).comment('Persons could create custom filters, be approved by our system automatically, then show up on other persons apps.');

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('parent_filter_id').references('id').inTable('filters');
        table.index('filter_token', 'filters_filter_token_index');
    })
    .createTable('activities_filters', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('activity_id').unsigned().notNullable();
        table.integer('filter_id').unsigned().notNullable();
        table.integer('gender_id').unsigned().nullable();
        table.integer('school_id').nullable();
        table.integer('company_id').nullable();
        table.integer('industry_id').nullable();
        table.boolean('is_negative').notNullable().defaultTo(false);
        table.boolean('not_used').notNullable().defaultTo(false).comment('If a person does not want to use a particular filter in their settings for a particular activity.');
        table.string('filter_value', 255).nullable();
        table.string('filter_value_min', 255).nullable();
        table.string('filter_value_max', 255).nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('activity_id').references('id').inTable('activities');
        table.foreign('filter_id').references('id').inTable('filters');
    })
    .createTable('activities_persons', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('activity_id').unsigned().notNullable();
        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('arrived_at').nullable();
        table.integer('cancelled_at').nullable().defaultTo(0).comment('If person cancels, system would try to fill remaining number_persons based on current time and start of activity');

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('activity_id').references('id').inTable('activities');
        table.foreign('person_id').references('id').inTable('persons');
    })
    .createTable('persons_industries', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('industry_id').unsigned().notNullable();
        table.boolean('is_active').notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('industry_id').references('id').inTable('industries');
    })
    .createTable('persons_filters', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('filter_id').unsigned().notNullable();
        table.integer('gender_id').unsigned().nullable();
        table.integer('school_id').unsigned().nullable();
        table.integer('company_id').unsigned().nullable();
        table.integer('industry_id').unsigned().nullable();
        table.boolean('is_negative').notNullable().defaultTo(false).comment('Example: If a person is a Chicago Cubs fan, and they put is_negative for New York Mets, notifications won\'t be sent out to anybody who added New York Mets as an interest.');
        table.boolean('is_mandatory').notNullable().defaultTo(false);
        table.integer('importance').notNullable().comment('Scale of 0 - 10');
        table.string('filter_value', 255).nullable();
        table.string('filter_value_min', 255).nullable();
        table.string('filter_value_max', 255).nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('filter_id').references('id').inTable('filters');
        table.foreign('gender_id').references('id').inTable('genders');
        table.foreign('school_id').references('id').inTable('schools');
        table.foreign('company_id').references('id').inTable('companies');
        table.foreign('industry_id').references('id').inTable('industries');
    })
    .createTable('persons_circles', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.string('circle_token', 255).notNullable().comment('Unique system-wide');
        table.string('circle_name', 255).notNullable();
        table.float('sort_position', 53).notNullable();
        table.bigInteger('circle_parent_id').unsigned().nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('circle_parent_id').references('id').inTable('persons_circles');
    })
    .createTable('persons_friends', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.bigInteger('friend_id').unsigned().notNullable();
        table.boolean('is_two_way').notNullable().defaultTo(false).comment('Helper column for code.');
        table.string('source', 255).nullable().comment('Source of where friend came from (i.e. befriend, phone, email, etc)');

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('friend_id').references('id').inTable('persons');
    })
    .createTable('persons_friends_circles', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.bigInteger('friend_id').unsigned().notNullable();
        table.bigInteger('circle_id').unsigned().notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('friend_id').references('id').inTable('persons');
        table.foreign('circle_id').references('id').inTable('persons_circles');
    })
    .createTable('persons_login_tokens', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.string('login_token', 255).notNullable();
        table.integer('expires').notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.index('login_token', 'persons_login_tokens_login_token_index');
    })
    .createTable('persons_verifications', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('verification_id').unsigned().notNullable();
        table.boolean('is_active').notNullable().defaultTo(false);
        table.integer('expires').nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('verification_id').references('id').inTable('verifications');
    })
    .createTable('persons_schools', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.integer('school_id').unsigned().notNullable();
        table.integer('year_from').notNullable();
        table.integer('year_to').notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('school_id').references('id').inTable('schools');
    })
    .createTable('persons_networks', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable();
        table.bigInteger('network_id').unsigned().notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_id').references('id').inTable('persons');
        table.foreign('network_id').references('id').inTable('networks');
    })
    .createTable('persons_companies', table => {
        table.bigIncrements('id').unsigned().primary();
        table.integer('company_id').unsigned().notNullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.date('date_start').nullable();
        table.date('date_end').nullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('company_id').references('id').inTable('companies');
    })
    .createTable('persons_reviews', table => {
        table.bigIncrements('id').unsigned().primary();
        table.bigInteger('person_from_id').unsigned().notNullable();
        table.bigInteger('person_to_id').unsigned().notNullable();
        table.bigInteger('activity_id').unsigned().notNullable();
        table.integer('review_id').unsigned().notNullable();
        table.integer('rating').notNullable();

        table.integer('created').notNullable();
        table.integer('updated').notNullable();

        table.foreign('person_from_id').references('id').inTable('persons');
        table.foreign('person_to_id').references('id').inTable('persons');
        table.foreign('activity_id').references('id').inTable('activities');
        table.foreign('review_id').references('id').inTable('reviews');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
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

    for(let table of tables) {
        await knex.schema.dropTable(table);
    }
};
