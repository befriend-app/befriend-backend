/**
 * Knex migration to reorder columns in the persons table
 */
exports.up = function(knex) {
    return knex.schema.alterTable('persons', table => {
        // Primary identifiers
        table.string('person_token', 255).notNullable().comment('Unique identifier system wide').after('id').alter();
        table.integer('registration_network_id').unsigned().notNullable()
            .comment('First network person registered with').after('person_token').alter();

        // Personal information
        table.string('first_name', 255).nullable().after('registration_network_id').alter();
        table.string('last_name', 255).nullable().after('first_name').alter();
        table.string('email', 255).nullable().after('last_name').alter();
        table.string('password', 255).nullable().after('email').alter();
        table.string('phone_country_code', 255).nullable().after('password').alter();
        table.string('phone_number', 255).nullable().after('phone_country_code').alter();

        table.string('country_code', 10).nullable().after('phone_number').alter();
        table.integer('gender_id').unsigned().nullable().after('country_code').alter();
        table.date('birth_date').nullable().after('gender_id').alter();
        table.integer('age').nullable().after('birth_date').alter();
        table.string('image_url', 255).nullable().after('age').alter();

        // Status flags
        table.boolean('is_person_known').notNullable().defaultTo(0).after('image_url').alter();
        table.boolean('is_new').nullable().defaultTo(0).after('is_person_known').alter();
        table.boolean('is_online').nullable().defaultTo(0).after('is_new').alter();
        table.boolean('is_blocked').nullable().defaultTo(0).after('is_online').alter();

        // Verification
        table.boolean('is_verified_in_person').nullable().defaultTo(0).after('is_blocked').alter();
        table.boolean('is_verified_linkedin').nullable().defaultTo(0).after('is_verified_in_person').alter();

        // Mode
        table.integer('current_mode_id').unsigned().nullable().after('is_verified_linkedin').alter();
        table.string('modes', 255).nullable().after('current_mode_id').alter();

        // Location
        table.integer('grid_id').unsigned().nullable().after('modes').alter();
        table.integer('prev_grid_id').unsigned().nullable().after('grid_id').alter();
        table.decimal('location_lat', 10, 7).nullable().after('prev_grid_id').alter();
        table.decimal('location_lon', 11, 7).nullable().after('location_lat').alter();
        table.mediumint('location_lat_1000').nullable().after('location_lon').alter();
        table.mediumint('location_lon_1000').nullable().after('location_lat_1000').alter();
        table.string('timezone', 255).nullable().after('location_lon_1000').alter();

        // Ratings and reviews
        table.integer('reviews_count').unsigned().notNullable().defaultTo(0)
            .comment('Aggregated from persons_reviews').after('timezone').alter();
        table.decimal('rating_safety', 5, 3).nullable().after('reviews_count').alter();
        table.decimal('rating_trust', 5, 3).nullable().after('rating_safety').alter();
        table.decimal('rating_timeliness', 5, 3).nullable().after('rating_trust').alter();
        table.decimal('rating_friendliness', 5, 3).nullable().after('rating_timeliness').alter();
        table.decimal('rating_fun', 5, 3).nullable().after('rating_friendliness').alter();
        table.decimal('no_show_percent', 5, 2).nullable().defaultTo(0.00).after('rating_fun').alter();
    });
};

exports.down = function(knex) {
    return knex.schema.alterTable('persons', table => {
    });
};