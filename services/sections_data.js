const cacheService = require('./cache');

module.exports = {
    drinking: {
        type: {
            name: 'buttons',
            single: true,
        },
        tables: {
            drinking: {
                data: {
                    name: 'drinking',
                },
                user: {
                    name: 'persons_drinking',
                    cols: {
                        id: 'drinking_id',
                    },
                },
            },
        },
        functions: {
            data: 'getDrinking',
        },
        styles: {
            rowCols: 'cols-1',
        },
    },
    genders: {
        type: {
            name: 'buttons',
            single: true,
        },
        tables: {
            genders: {
                data: {
                    name: 'genders',
                },
                user: {
                    name: 'persons',
                    cols: {
                        id: 'gender_id',
                        person_id: 'id',
                    },
                },
            },
        },
        functions: {
            data: 'getGenders',
        },
        styles: {
            rowCols: 'cols-3',
        },
    },
    languages: {
        type: {
            name: 'buttons',
            multi: true,
        },
        tables: {
            languages: {
                data: {
                    name: 'languages',
                },
                user: {
                    name: 'persons_languages',
                    cols: {
                        id: 'language_id',
                    },
                },
            },
        },
        functions: {
            data: 'getLanguages',
        },
        styles: {
            rowCols: 'cols-2',
        },
    },
    life_stages: {
        type: {
            name: 'buttons',
            multi: true,
            exclusive: {},
        },
        tables: {
            life_stages: {
                data: {
                    name: 'life_stages',
                },
                user: {
                    name: 'persons_life_stages',
                    cols: {
                        id: 'life_stage_id',
                    },
                },
            },
        },
        functions: {
            data: 'getLifeStages',
        },
        styles: {
            rowCols: 'cols-2',
        },
    },
    politics: {
        type: {
            name: 'buttons',
            single: true,
        },
        tables: {
            politics: {
                data: {
                    name: 'politics',
                },
                user: {
                    name: 'persons_politics',
                    cols: {
                        id: 'politics_id',
                    },
                },
            },
        },
        functions: {
            data: 'getPolitics',
        },
        styles: {
            rowCols: 'cols-1',
        },
    },
    relationships: {
        type: {
            name: 'buttons',
            multi: true,
        },
        tables: {
            relationship_status: {
                data: {
                    name: 'relationship_status',
                },
                user: {
                    name: 'persons_relationship_status',
                    cols: {
                        id: 'relationship_status_id',
                    },
                },
            },
        },
        functions: {
            data: 'getRelationshipStatus',
        },
        styles: {
            rowCols: 'cols-2',
        },
    },
    religion: {
        type: {
            name: 'buttons',
            multi: true,
            exclusive: {
                token: 'not_religious', // This token will deselect all others when selected
            },
        },
        tables: {
            religion: {
                data: {
                    name: 'religions',
                },
                user: {
                    name: 'persons_religions',
                    cols: {
                        id: 'religion_id',
                    },
                },
            },
        },
        functions: {
            data: 'getReligions',
        },
        styles: {
            rowCols: 'cols-2',
        },
    },
    smoking: {
        type: {
            name: 'buttons',
            single: true,
        },
        tables: {
            smoking: {
                data: {
                    name: 'smoking',
                },
                user: {
                    name: 'persons_smoking',
                    cols: {
                        id: 'smoking_id',
                    },
                },
            },
        },
        functions: {
            data: 'getSmoking',
        },
        styles: {
            rowCols: 'cols-1',
        },
    },
    instruments: {
        myStr: 'My Instruments',
        tables: {
            instruments: {
                data: {
                    name: 'instruments',
                },
                user: {
                    name: 'persons_instruments',
                    cols: {
                        id: 'instrument_id',
                        secondary: 'skill_level',
                    },
                },
            },
        },
        categories: {
            options: [
                {
                    name: 'String',
                },
                {
                    name: 'Keyboard',
                },
                {
                    name: 'Voice',
                },
                {
                    name: 'Wind',
                },
                {
                    name: 'Brass',
                },
                {
                    name: 'Percussion',
                },
                {
                    name: 'Electronic',
                },
            ],
            cacheKeys: {
                items: {
                    key: cacheService.keys.instruments_common,
                },
            },
        },
        secondary: {
            instruments: {
                options: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Virtuoso'],
                unselectedStr: 'Skill Level',
            },
        },
        autoComplete: {
            minChars: 1,
            endpoint: '/autocomplete/instruments',
            placeholders: {
                main: 'Search instruments',
            },
        },
        functions: {
            data: 'getInstruments',
            all: 'allInstruments',
        },
        styles: {
            rowCols: 'cols-2',
        },
        cacheKeys: {
            instruments: {
                byHash: cacheService.keys.instruments,
            },
        },
    },
    movies: {
        myStr: 'My Movies',
        tabs: [
            {
                name: 'Movies',
                key: 'movies',
            },
            {
                name: 'Genres',
                key: 'genres',
            },
        ],
        tables: {
            movies: {
                isFavorable: true,
                data: {
                    name: 'movies',
                },
                user: {
                    name: 'persons_movies',
                    cols: {
                        id: 'movie_id',
                        token: 'movie_token',
                    },
                },
            },
            genres: {
                isFavorable: true,
                data: {
                    name: 'movie_genres',
                },
                user: {
                    name: 'persons_movie_genres',
                    cols: {
                        id: 'genre_id',
                        token: 'genre_token',
                    },
                },
            },
        },
        categories: {
            endpoint: `/movies/category/top`,
            options: null,
            fn: 'getMovieCategories',
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/movies',
            placeholders: {
                main: 'Search movies',
            },
        },
        cacheKeys: {
            movies: {
                byHash: cacheService.keys.movies,
            },
            genres: {
                byHash: cacheService.keys.movie_genres,
            },
        },
        functions: {
            data: 'getMovies',
        },
        styles: {
            rowCols: {
                default: 'cols-1',
                my: 'cols-1',
            },
        },
    },
    music: {
        myStr: 'My Music',
        tabs: [
            {
                name: 'Artists',
                key: 'artists',
            },
            {
                name: 'Genres',
                key: 'genres',
            },
        ],
        tables: {
            artists: {
                isFavorable: true,
                data: {
                    name: 'music_artists',
                },
                user: {
                    name: 'persons_music_artists',
                    cols: {
                        id: 'artist_id',
                        token: 'artist_token',
                    },
                },
            },
            genres: {
                isFavorable: true,
                data: {
                    name: 'music_genres',
                },
                user: {
                    name: 'persons_music_genres',
                    cols: {
                        id: 'genre_id',
                        token: 'genre_token',
                    },
                },
            },
        },
        categories: {
            endpoint: `/music/top/artists/genre`,
            options: null,
            fn: 'getMusicCategories',
            defaultCountry: 'US',
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/music',
            placeholders: {
                main: 'Search music',
            },
        },
        cacheKeys: {
            genres: {
                byHash: cacheService.keys.music_genres,
            },
            artists: {
                byHash: cacheService.keys.music_artists,
            },
        },
        functions: {
            data: 'getMusic',
        },
        styles: {
            rowCols: {
                default: 'cols-2',
                my: 'cols-1',
            },
        },
    },
    schools: {
        tables: {
            schools: {
                data: {
                    name: 'schools',
                },
                user: {
                    name: 'persons_schools',
                    cols: {
                        id: 'school_id',
                        token: 'school_token',
                        hashKey: 'hash_token',
                    },
                },
            },
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/schools',
            placeholders: {
                main: 'Search schools',
                list: 'Country',
            },
            filter: {
                hashKey: 'code',
                list: [],
                noResults: 'No countries found',
            },
            groups: {
                college: {
                    name: 'Universities and Colleges',
                },
                hs: {
                    name: 'High Schools',
                },
                grade: {
                    name: 'Middle Schools',
                },
                other: {
                    name: 'Other',
                },
            },
        },
        cacheKeys: {
            schools: {
                byHashKey: cacheService.keys.schools_country,
            },
        },
        functions: {
            filterList: 'getSchools',
        },
        styles: {
            rowCols: 'cols-1',
        },
    },
    sports: {
        myStr: 'My Sports',
        tabs: [
            {
                name: 'Teams',
                key: 'teams',
            },
            {
                name: 'Leagues',
                key: 'leagues',
            },
            {
                name: 'Play',
                key: 'play',
            },
        ],
        tables: {
            teams: {
                isFavorable: true,
                data: {
                    name: 'sports_teams',
                },
                user: {
                    name: 'persons_sports_teams',
                    cols: {
                        id: 'team_id',
                        token: 'team_token',
                        secondary: 'level',
                    },
                },
            },
            leagues: {
                isFavorable: true,
                data: {
                    name: 'sports_leagues',
                },
                user: {
                    name: 'persons_sports_leagues',
                    cols: {
                        id: 'league_id',
                        token: 'league_token',
                        secondary: 'level',
                    },
                },
            },
            play: {
                isFavorable: true,
                data: {
                    name: 'sports',
                },
                user: {
                    name: 'persons_sports_play',
                    cols: {
                        id: 'sport_id',
                        token: 'sport_token',
                        secondary: 'level',
                    },
                },
            },
        },
        categories: {
            endpoint: `/sports/top/teams`,
            options: null,
            fn: 'getSportCategories',
            defaultCountry: 'US',
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/sports',
            placeholders: {
                main: 'Search teams or leagues',
            },
        },
        cacheKeys: {
            play: {
                byHash: cacheService.keys.sports,
            },
            teams: {
                byHash: cacheService.keys.sports_teams,
            },
            leagues: {
                byHash: cacheService.keys.sports_leagues,
            },
        },
        secondary: {
            play: {
                options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
                unselectedStr: 'Skill Level',
            },
            teams: {
                options: ['Casual', 'Regular', 'Avid', 'Superfan'],
                unselectedStr: 'Fan Level',
            },
            leagues: {
                options: ['Casual', 'Regular', 'Avid', 'Superfan'],
                unselectedStr: 'Fan Level',
            },
        },
        functions: {
            data: 'getSports',
        },
        styles: {
            rowCols: {
                default: 'cols-2',
                my: 'cols-1',
            },
        },
    },
    tv_shows: {
        myStr: 'My TV',
        tabs: [
            {
                name: 'Shows',
                key: 'shows',
            },
            {
                name: 'Genres',
                key: 'genres',
            },
        ],
        tables: {
            shows: {
                isFavorable: true,
                data: {
                    name: 'tv_shows',
                },
                user: {
                    name: 'persons_tv_shows',
                    cols: {
                        id: 'show_id',
                        token: 'show_token',
                    },
                },
            },
            genres: {
                isFavorable: true,
                data: {
                    name: 'tv_genres',
                },
                user: {
                    name: 'persons_tv_genres',
                    cols: {
                        id: 'genre_id',
                        token: 'genre_token',
                    },
                },
            },
        },
        categories: {
            endpoint: '/tv/category/top',
            options: null,
            fn: 'getTvCategories',
        },
        autoComplete: {
            minChars: 2,
            endpoint: '/autocomplete/tv',
            placeholders: {
                main: 'Search TV shows',
            },
        },
        cacheKeys: {
            shows: {
                byHash: cacheService.keys.tv_shows,
            },
            genres: {
                byHash: cacheService.keys.tv_genres,
            },
        },
        functions: {
            data: 'getTvShows',
        },
        styles: {
            rowCols: {
                default: 'cols-1',
                my: 'cols-1',
            },
        },
    },
    work: {
        myStr: 'My Work',
        tabs: [
            {
                name: 'Industries',
                key: 'industries',
            },
            {
                name: 'Roles',
                key: 'roles',
            },
        ],
        tables: {
            industries: {
                data: {
                    name: 'work_industries',
                },
                user: {
                    name: 'persons_industries',
                    cols: {
                        id: 'industry_id',
                        token: 'industry_token',
                    },
                },
            },
            roles: {
                data: {
                    name: 'work_roles',
                },
                user: {
                    name: 'persons_roles',
                    cols: {
                        id: 'role_id',
                        token: 'role_token',
                    },
                },
            },
        },
        autoComplete: {
            minChars: 1,
            endpoint: '/autocomplete/work',
            placeholders: {
                main: 'Search industries or roles',
            },
        },
        cacheKeys: {
            industries: {
                byHash: cacheService.keys.work_industries,
            },
            roles: {
                byHash: cacheService.keys.work_roles,
            },
        },
        functions: {
            data: 'getWork',
        },
        styles: {
            rowCols: {
                default: 'cols-2',
                my: 'cols-1',
            },
        },
    },
    getSectionByTableName: function (tableName) {
        for (let k in this) {
            if (!this[k].tables) {
                continue;
            }

            let sectionData = this[k];

            for (let t in sectionData.tables) {
                let tableData = sectionData.tables[t];

                if (tableData.user.name === tableName) {
                    return sectionData;
                }
            }
        }
    },
};
