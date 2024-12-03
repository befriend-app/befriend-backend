const { timeNow, loadScriptEnv } = require('../services/shared');
const dbService = require('../services/db');

loadScriptEnv();

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Add filters');

            let conn = await dbService.conn();
            const now = timeNow();

            const filters = [
                {
                    filter_token: 'network',
                    filter_name: 'Networks',
                    sort_position: 10,
                    is_network: true,
                },
                {
                    filter_token: 'activity_type',
                    filter_name: 'Activity Types',
                    sort_position: 11,
                    is_activity_type: true,
                },
                {
                    filter_token: 'mode',
                    filter_name: 'Modes',
                    sort_position: 12,
                    is_mode: true,
                },
                {
                    filter_token: 'day_of_week',
                    filter_name: 'Day of Week',
                    sort_position: 13,
                    is_day_of_week: true,
                },
                {
                    filter_token: 'time_of_day',
                    filter_name: 'Time of Day',
                    sort_position: 14,
                    is_time_of_day: true,
                },
                {
                    filter_token: 'distance',
                    filter_name: 'Distance',
                    sort_position: 15,
                    is_distance: true,
                },
                {
                    filter_token: 'reviews_safety',
                    filter_name: 'Safety',
                    sort_position: 21,
                    is_review_safe: true,
                },
                {
                    filter_token: 'reviews_trust',
                    filter_name: 'Trust',
                    sort_position: 21,
                    is_review_trust: true,
                },
                {
                    filter_token: 'reviews_timeliness',
                    filter_name: 'Timeliness',
                    sort_position: 22,
                    is_review_timeliness: true,
                },
                {
                    filter_token: 'reviews_friendliness',
                    filter_name: 'Friendliness',
                    sort_position: 23,
                    is_review_friendliness: true,
                },
                {
                    filter_token: 'reviews_fun',
                    filter_name: 'Fun',
                    sort_position: 24,
                    is_review_fun: true,
                },
                {
                    filter_token: 'reviews_unrated',
                    filter_name: 'Unrated',
                    sort_position: 26,
                    is_review_unrated: true,
                },
                {
                    filter_token: 'verification_linkedin',
                    filter_name: 'LinkedIn',
                    sort_position: 41,
                    is_verification_linkedin: true,
                },
                {
                    filter_token: 'verification_dl',
                    filter_name: `Driver's License`,
                    sort_position: 42,
                    is_verification_dl: true,
                },
                {
                    filter_token: 'verification_cc',
                    filter_name: 'Credit Card',
                    sort_position: 43,
                    is_verification_cc: true,
                },
                {
                    filter_token: 'verification_video',
                    filter_name: 'Video',
                    sort_position: 44,
                    is_verification_video: true,
                },
                {
                    filter_token: 'verification_in_person',
                    filter_name: 'In-Person',
                    sort_position: 45,
                    is_verification_in_person: true,
                },
                {
                    filter_token: 'verification_mailer',
                    filter_name: 'Mail',
                    sort_position: 46,
                    is_verification_mailer: true,
                },
                {
                    filter_token: 'age',
                    filter_name: 'Age',
                    sort_position: 47,
                    is_age: true,
                },
                {
                    filter_token: 'gender',
                    filter_name: 'Gender',
                    sort_position: 61,
                    is_gender: true,
                },
                {
                    filter_token: 'life_stage',
                    filter_name: 'Life Stage',
                    sort_position: 62,
                    is_life_stage: true,
                },
                {
                    filter_token: 'relationship',
                    filter_name: 'Relationship Status',
                    sort_position: 63,
                    is_relationship: true,
                },

                {
                    filter_token: 'school',
                    filter_name: 'School',
                    sort_position: 81,
                    is_school: true,
                },
                {
                    filter_token: 'work_industry',
                    filter_name: 'Industry',
                    sort_position: 82,
                    is_work_industry: true,
                },
                {
                    filter_token: 'work_role',
                    filter_name: 'Role',
                    sort_position: 83,
                    is_work_role: true,
                },
                {
                    filter_token: 'sport_play',
                    filter_name: 'Play',
                    sort_position: 101,
                    is_sport_play: true,
                },
                {
                    filter_token: 'sport_league',
                    filter_name: 'Leagues',
                    sort_position: 102,
                    is_sport_league: true,
                },
                {
                    filter_token: 'sport_team',
                    filter_name: 'Teams',
                    sort_position: 103,
                    is_sport_team: true,
                },

                {
                    filter_token: 'movie_genre',
                    filter_name: 'Genres',
                    sort_position: 121,
                    is_movie_genre: true,
                },
                {
                    filter_token: 'movies',
                    filter_name: 'Movies',
                    sort_position: 122,
                    is_movies: true,
                },
                {
                    filter_token: 'tv_show_genre',
                    filter_name: 'Genres',
                    sort_position: 123,
                    is_tv_show_genre: true,
                },
                {
                    filter_token: 'tv_shows',
                    filter_name: 'TV Shows',
                    sort_position: 124,
                    is_tv_shows: true,
                },
                {
                    filter_token: 'music_artist',
                    filter_name: 'Music Artists',
                    sort_position: 125,
                    is_music_artist: true,
                },
                {
                    filter_token: 'music_genre',
                    filter_name: 'Music Genres',
                    sort_position: 126,
                    is_music_genre: true,
                },

                {
                    filter_token: 'instruments',
                    filter_name: 'Instruments',
                    sort_position: 141,
                    is_instruments: true,
                },
                {
                    filter_token: 'languages',
                    filter_name: 'Languages',
                    sort_position: 142,
                    is_languages: true,
                },

                {
                    filter_token: 'drinking',
                    filter_name: 'Drinking',
                    sort_position: 161,
                    is_drinking: true,
                },
                {
                    filter_token: 'smoking',
                    filter_name: 'Smoking',
                    sort_position: 162,
                    is_smoking: true,
                },

                {
                    filter_token: 'politics',
                    filter_name: 'Politics',
                    sort_position: 181,
                    is_politics: true,
                },
                {
                    filter_token: 'religion',
                    filter_name: 'Religion',
                    sort_position: 182,
                    is_religion: true,
                },
            ];

            for (const filter of filters) {
                const exists = await conn('filters')
                    .where('filter_token', filter.filter_token)
                    .first();

                if (!exists) {
                    await conn('filters').insert({
                        ...filter,
                        created: now,
                        updated: now
                    });
                } else {
                    await conn('filters')
                        .where('id', exists.id)
                        .update({
                            ...filter,
                            updated: now
                        })
                }
            }

            console.log('Filters added');
            resolve();
        } catch (error) {
            console.error('Error adding filters:', error);
            reject(error);
        }
    });
}

module.exports = {
    main
};

if (require.main === module) {
    (async function() {
        try {
            await main();
            process.exit();
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    })();
}