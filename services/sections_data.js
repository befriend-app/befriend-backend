const cacheService = require('./cache');

module.exports = {
    instruments: {
        myStr: 'My Instruments',
        tables: {
            instruments: {
                data: {
                    name: 'instruments'
                },
                user: {
                    name: 'persons_instruments',
                    cols: {
                        id: 'instrument_id',
                        secondary: 'skill_level'
                    },
                },
            }
        },
        categories: {
            options: [
                {
                    name: 'String'
                },
                {
                    name: 'Keyboard'
                },
                {
                    name: 'Voice'
                },
                {
                    name: 'Wind'
                },
                {
                    name: 'Brass'
                },
                {
                    name: 'Percussion'
                },

                {
                    name: 'Electronic'
                },
            ],
            cacheKeys: {
                items: {
                    key: cacheService.keys.instruments_common
                },
            }
        },
        secondary: {
            options: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Virtuoso'],
            unselectedStr: 'Skill Level',
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
            rowCols: 'cols-2'
        }
    },
    movies: {
        myStr: 'My Movies',
        tabs: [
            {
                name: 'Movies',
                key: 'movies'
            },
            {
                name: 'Genres',
                key: 'genres'
            }
        ],
        tables: {
            movies: {
                isFavorable: true,
                data: {
                    name: 'movies'
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
                    name: 'movies_genres'
                },
                user: {
                    name: 'persons_movie_genres',
                    cols: {
                        id: 'genre_id',
                        token: 'genre_token',
                    },
                },
            }
        },
        categories: {
            endpoint: `/movies/top/genre`,
            options: null,
            fn: 'getCategoriesMovies',
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
            }
        }
    },
    music: {
        myStr: 'My Music',
        tabs: [
            {
                name: 'Artists',
                key: 'artists'
            },
            {
                name: 'Genres',
                key: 'genres'
            }
        ],
        tables: {
            genres: {
                isFavorable: true,
                data: {
                    name: 'music_genres'
                },
                user: {
                    name: 'persons_music_genres',
                    cols: {
                        id: 'genre_id',
                        token: 'genre_token',
                    },
                },
            },
            artists: {
                isFavorable: true,
                data: {
                    name: 'music_artists'
                },
                user: {
                    name: 'persons_music_artists',
                    cols: {
                        id: 'artist_id',
                        token: 'artist_token',
                    },
                },
            },
        },
        categories: {
            endpoint: `/music/top/artists/genre`,
            options: null,
            fn: 'getCategoriesMusic',
            defaultCountry: 'US'
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
            }
        }
    },
    schools: {
        tables: {
            schools: {
                data: {
                    name: 'schools'
                },
                user: {
                    name: 'persons_schools',
                    cols: {
                        id: 'school_id',
                        token: 'school_token',
                        hashKey: 'hash_token'
                    },
                },
            }
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
                noResults: 'No countries found'
            },
            groups: {
                college: {
                    name: 'Universities and Colleges'
                },
                hs: {
                    name: 'High Schools'
                },
                grade: {
                    name: 'Middle Schools'
                },
                other: {
                    name: 'Other',
                }
            }
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
            rowCols: 'cols-1'
        }
    },
}