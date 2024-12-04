const filterTables = {
    network: { column: 'network_id', table: 'networks' },
    activity_type: { column: 'activity_type_id', table: 'activity_types' },
    gender: { column: 'gender_id', table: 'genders' },
    life_stage: { column: 'life_stage_id', table: 'life_stages' },
    relationship_status: { column: 'relationship_status_id', table: 'relationship_status' },
    school: { column: 'school_id', table: 'schools' },
    work_industry: { column: 'work_industry_id', table: 'work_industries' },
    work_role: { column: 'work_role_id', table: 'work_industries' },
    sport_play: { column: 'sport_play_id', table: 'sports' },
    sport_league: { column: 'sport_league_id', table: 'sports_leagues' },
    sport_team: { column: 'sport_team_id', table: 'sports_teams' },
    movie: { column: 'movie_id', table: 'movies' },
    movie_genre: { column: 'movie_genre_id', table: 'movie_genres' },
    tv_show: { column: 'tv_show_id', table: 'tv_shows' },
    tv_show_genre: { column: 'tv_show_genre_id', table: 'tv_genres' },
    music_artist: { column: 'music_artist_id', table: 'music_artists' },
    music_genre: { column: 'music_genre_id', table: 'music_genres' },
    instrument: { column: 'instrument_id', table: 'instruments' },
    language: { column: 'language_id', table: 'languages' },
    drinking: { column: 'drinking_id', table: 'drinking' },
    smoking: { column: 'smoking_id', table: 'smoking' },
    politics: { column: 'politics_id', table: 'politics' },
    religion: { column: 'religion_id', table: 'religions' },
    book: { column: 'book_id', table: 'books' },
    book_author: { column: 'book_author_id', table: 'authors' }
};

const sharedCols = {
    settings: (table) => {
        table.boolean('is_send').notNullable().defaultTo(false);
        table.boolean('is_receive').notNullable().defaultTo(false);
        table.boolean('is_negative').notNullable().defaultTo(false);
        table.string('secondary_level').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
    },
    filterValues: (table) => {
        table.string('filter_value').nullable();
        table.string('filter_value_min').nullable();
        table.string('filter_value_max').nullable();
    },
    timestamps: (table) => {
        table.bigInteger('created').notNullable();
        table.bigInteger('updated').notNullable();
        table.bigInteger('deleted').nullable();
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    await knex.schema.dropTableIfExists('persons_filters');
    await knex.schema.dropTableIfExists('activities_filters');
    await knex.schema.dropTableIfExists('filters');

    await knex.schema
        .createTable('filters', table => {
            table.increments('id').unsigned().primary();
            table.string('token').notNullable().comment('Unique system-wide');
            table.string('name').notNullable();
            table.integer('position').notNullable().defaultTo(0);

            table.boolean('is_single').notNullable().defaultTo(false);
            table.boolean('is_multi').notNullable().defaultTo(false);

            table.boolean('is_network').notNullable().defaultTo(false);
            table.boolean('is_activity_type').notNullable().defaultTo(false);
            table.boolean('is_mode').notNullable().defaultTo(false);
            table.boolean('is_day_of_week').notNullable().defaultTo(false);
            table.boolean('is_time_of_day').notNullable().defaultTo(false);

            table.boolean('is_distance').notNullable().defaultTo(false);

            //reviews
            table.boolean('is_review_safe').notNullable().defaultTo(false);
            table.boolean('is_review_trust').notNullable().defaultTo(false);
            table.boolean('is_review_timeliness').notNullable().defaultTo(false);
            table.boolean('is_review_friendliness').notNullable().defaultTo(false);
            table.boolean('is_review_fun').notNullable().defaultTo(false);
            table.boolean('is_review_unrated').notNullable().defaultTo(false);

            //verifications
            table.boolean('is_verification_linkedin').notNullable().defaultTo(false);
            table.boolean('is_verification_dl').notNullable().defaultTo(false).comment(`Driver's license`);
            table.boolean('is_verification_cc').notNullable().defaultTo(false).comment('Credit card');
            table.boolean('is_verification_video').notNullable().defaultTo(false);
            table.boolean('is_verification_in_person').notNullable().defaultTo(false);
            table.boolean('is_verification_mailer').notNullable().defaultTo(false);

            //sections
            table.boolean('is_age').notNullable().defaultTo(false);
            table.boolean('is_gender').notNullable().defaultTo(false);
            table.boolean('is_life_stage').notNullable().defaultTo(false);
            table.boolean('is_relationship').notNullable().defaultTo(false);
            table.boolean('is_school').notNullable().defaultTo(false);

            table.boolean('is_work_industry').notNullable().defaultTo(false);
            table.boolean('is_work_role').notNullable().defaultTo(false);

            table.boolean('is_sport_play').notNullable().defaultTo(false);
            table.boolean('is_sport_league').notNullable().defaultTo(false);
            table.boolean('is_sport_team').notNullable().defaultTo(false);
            table.boolean('is_movie_genre').notNullable().defaultTo(false);
            table.boolean('is_movies').notNullable().defaultTo(false);
            table.boolean('is_tv_show_genre').notNullable().defaultTo(false);
            table.boolean('is_tv_shows').notNullable().defaultTo(false);
            table.boolean('is_music_artist').notNullable().defaultTo(false);
            table.boolean('is_music_genre').notNullable().defaultTo(false);
            table.boolean('is_instruments').notNullable().defaultTo(false);
            table.boolean('is_languages').notNullable().defaultTo(false);
            table.boolean('is_drinking').notNullable().defaultTo(false);
            table.boolean('is_smoking').notNullable().defaultTo(false);
            table.boolean('is_politics').notNullable().defaultTo(false);
            table.boolean('is_religion').notNullable().defaultTo(false);
            table.boolean('is_book_author').notNullable().defaultTo(false);
            table.boolean('is_book_title').notNullable().defaultTo(false);

            //other
            table.boolean('is_birth_city').notNullable().defaultTo(false).comment(`Person born in Toronto could find other persons born in Toronto wherever they're located.`);
            table.boolean('is_birth_country').notNullable().defaultTo(false);
            table.boolean('is_home_city').notNullable().defaultTo(false).comment('Person who lives in London, visiting Chicago, could filter for other persons who live in London that are currently in Chicago.');
            table.boolean('is_home_country').notNullable().defaultTo(false);
            table.boolean('is_custom').notNullable().defaultTo(false).comment('Persons could create custom filters, be approved by our system automatically, then show up on other persons apps.');

            sharedCols.timestamps(table);
        });

    await knex.schema.createTable('persons_filters', table => {
        table.increments('id').unsigned().primary();
        table.bigInteger('person_id').unsigned().notNullable().references('id').inTable('persons');
        table.integer('filter_id').unsigned().notNullable().references('id').inTable('filters');

        for(let k in filterTables) {
            let data = filterTables[k];

            table.integer(data.column).unsigned().nullable().references('id').inTable(data.table);
        }

        for(let k in sharedCols) {
            sharedCols[k](table);
        }
    });

    return knex.schema.createTable('activities_filters', table => {
        table.increments('id').unsigned().primary();
        table.bigInteger('activity_id').unsigned().notNullable().references('id').inTable('activities');
        table.integer('filter_id').unsigned().notNullable().references('id').inTable('filters');

        for(let k in filterTables) {
            let data = filterTables[k];

            table.integer(data.column).unsigned().nullable().references('id').inTable(data.table);
        }

        for(let k in sharedCols) {
            sharedCols[k](table);
        }
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('persons_filters');
    await knex.schema.dropTableIfExists('activities_filters');
    await knex.schema.dropTableIfExists('filters');
};
