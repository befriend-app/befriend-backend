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
            options: ['String', 'Wind', 'Brass', 'Percussion', 'Keyboard', 'Electronic', 'Voice'],
            cacheKeys: {
                items: cacheService.keys.instruments_common
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
    music: {
        myStr: 'My Music',
        hasTabs: true,
        tables: {
            genres: {
                isFavorable: true,
                data: {
                    name: 'music_genres'
                },
                user: {
                    name: 'persons_music_genres',
                    cols: {
                        id: 'genre_id'
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
                    },
                },
            },
        },
        categories: {
            options: null,
            fn: `getMusicGenres`,
            hasKey: true, //key of country code
        },
        autoComplete: {
            minChars: 1,
            endpoint: '/autocomplete/music',
            placeholders: {
                main: 'Search music',
            },
        },
        cacheKeys: {
            // display: cacheService.keys.instruments_common,
        },
        functions: {
            data: 'getMusic',
        },
        styles: {
            rowCols: 'cols-2'
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
                        hashToken: 'hash_token'
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
            byHashToken: cacheService.keys.schools_country,
        },
        functions: {
            filterList: 'getSchools',
        },
        styles: {
            rowCols: 'cols-1'
        }
    },
}