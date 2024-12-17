const axios = require('axios');
const yargs = require('yargs');

const cacheService = require('../../services/cache');
const dbService = require('../../services/db');
const meService = require('../../services/me');

const { getNetworkSelf } = require('../../services/network');

const { loadScriptEnv, timeNow, joinPaths, shuffleFunc } = require('../../services/shared');
const { getSections, modes, getSports } = require('../../services/me');
const { getModes } = require('../../services/modes');

const sectionsData = require('../../services/sections_data');

loadScriptEnv();

let args = yargs.argv;

let num_persons = 1000;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let conn, self_network, persons;

let parallelCount = 1;

let chunks = [];

let helpers = {
    favoritePositionTracker: function (items = {}, tableKey) {
        const currentPosition = Object.values(items)
            .reduce((acc, item) => {
                if (item.table_key === tableKey) {
                    if (item.is_favorite && item.favorite_position >= acc) {
                        return acc + 1;
                    }
                }
                return acc;
            }, 0);

        return {
            position: currentPosition || 0,
            next() {
                return this.position++;
            }
        };
    },
    addSectionItems: async function({
                                 person,
                                 sectionKey,
                                 tableKey,
                                 items,
                                 favoriteTracker = null,
                                 secondaryOptions = null,
                                 favoriteChance = 0.4,
                                 secondaryChance = 0.6,
                                 hashToken = null
                             }) {
        const results = [];

        for (const item of items) {
            // Skip if already exists
            if (item.token in person.sections.active[sectionKey]?.items) {
                continue;
            }

            try {
                // Add the item
                const response = await axios.post(
                    joinPaths(process.env.APP_URL, '/me/sections/items'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        section_key: sectionKey,
                        table_key: tableKey,
                        item_token: item.token,
                        ...(hashToken && {
                            hash_token: hashToken
                        })
                    }
                );

                const isFavorite = favoriteTracker && Math.random() > (1 - favoriteChance);
                const addSecondary = secondaryOptions && Math.random() > (1 - secondaryChance);
                const secondaryValue = addSecondary ? shuffleFunc(secondaryOptions)[0] : null;

                if (isFavorite || secondaryValue) {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/me/sections/items'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            section_key: sectionKey,
                            table_key: tableKey,
                            section_item_id: response.data.id,
                            ...(isFavorite && {
                                favorite: {
                                    active: true,
                                    position: favoriteTracker.next()
                                }
                            }),
                            ...(secondaryValue && { secondary: secondaryValue }),
                        }
                    );
                }

                results.push(response.data);
            } catch (error) {
                console.error(`Error adding item ${item.token} for person ${person.person_token}:`, error.message);
            }
        }

        return results;
    },
    processBatch: async function(processFn) {
        let processed = 0;
        const total = persons.length;

        for (let chunk of chunks) {
            await Promise.all(
                chunk.map(async (person) => {
                    if (processed % 100 === 0) {
                        console.log({
                            processing: `${processed + 1}/${total}`
                        });
                    }

                    try {
                        await processFn(person);
                    } catch (error) {
                        console.error(`Error processing person ${person.person_token}:`, error.message);
                    }

                    processed++;
                })
            );
        }
    },
    selectRandomItems: function(items, min, max) {
        const count = Math.floor(Math.random() * (max - min + 1)) + min;
        return shuffleFunc([...items]).slice(0, count);
    },
    isSectionActive: function(person, sectionKey) {
        return !!person.sections?.active?.[sectionKey];
    }
};

async function getPersonsLogins() {
    console.log({
        mock: 'logins'
    });

    let ts = timeNow();

    persons = await conn('persons')
        .where('network_id', self_network.id)
        .limit(num_persons);

    let persons_logins = await conn('persons_login_tokens').whereIn(
        'person_id',
        persons.map((item) => item.id),
    );

    let persons_dict = persons_logins.reduce((acc, item) => {
        acc[item.person_id] = item.login_token;
        return acc;
    }, {});

    for (let i = 0; i < persons.length; i += parallelCount) {
        chunks.push(persons.slice(i, i + parallelCount));
    }

    let processed = 0;

    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if(processed % 100 === 0) {
                    console.log({
                        processing: `${processed+1}/${persons.length}`
                    });
                }

                if (!persons_dict[person.id]) {
                    try {
                        let r = await axios.post(joinPaths(process.env.APP_URL, 'login'), {
                            email: person.email,
                            password: 'password',
                        });
                        persons_dict[person.id] = r.data.login_token;
                        person.login_token = r.data.login_token;
                    } catch(e) {
                        console.error(e);
                    }
                } else {
                    person.login_token = persons_dict[person.id];
                }

                processed++;
            }),
        );
    }

    console.log({
        logins: timeNow() - ts
    });
}

async function processSections() {
    console.log({
        mock: 'sections'
    });

    let ts = timeNow();

    let processed = 0;

    //fill 70% of sections
    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if(processed % 100 === 0) {
                    console.log({
                        processing: `${processed+1}/${persons.length}`
                    });
                }

                try {
                    let sections = await getSections(person);

                    let all_keys = Object.keys(sections.all);
                    let active_keys = Object.keys(sections.active);

                    let changed = false;

                    while ((active_keys.length / all_keys.length) < .7) {
                        let options = all_keys.filter(item => !active_keys.includes(item));

                        let key = shuffleFunc(options)[0];

                        let r = await axios.post(joinPaths(process.env.APP_URL, '/me/sections'), {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            key,
                        });

                        active_keys.push(key);

                        changed = true;
                    }

                    if(changed) {
                        person.sections = await getSections(person);
                    } else {
                        person.sections = sections;
                    }
                } catch(e) {
                    console.error(e);
                }

                processed++;
            }),
        );
    }

    console.log({
        sections: timeNow() - ts
    });
}

async function processModes() {
    console.log({
        mock: 'modes'
    });

    // Get all available modes
    const modes = await getModes();
    const modesArray = Object.values(modes.byId);

    const genders = await meService.getGenders(true);

    const cache_key_kid_ages = cacheService.keys.kids_ages;
    const ages = await cacheService.getObj(cache_key_kid_ages);
    const ageTokens = Object.keys(ages);

    let processed = 0;

    // Process each chunk of persons
    for (let chunk of chunks) {
        await Promise.all(
            chunk.map(async (person) => {
                if(processed % 100 === 0) {
                    console.log({
                        processing: `${processed+1}/${persons.length}`
                    });
                }

                try {
                    // Skip if person already has a mode
                    if (person.mode_id !== null) {
                        processed++;
                        return;
                    }

                    // Randomly select a new mode
                    const newMode = shuffleFunc(modesArray)[0];

                    // Update person's mode
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/me/mode'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            mode: newMode.token,
                        }
                    );

                    // Randomly decide if we should add partner
                    if (Math.random() > 0.5) {
                        const randomGender = shuffleFunc(genders)[0];

                        await axios.put(
                            joinPaths(process.env.APP_URL, '/me/mode/partner'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                gender_token: randomGender.token,
                                is_select: true,
                            }
                        );
                    }

                    // Randomly decide if we should add kids (30% chance)
                    if (Math.random() > 0.7) {
                        // Add 1-3 kids
                        const numKids = Math.floor(Math.random() * 3) + 1;

                        for (let i = 0; i < numKids; i++) {
                            // Add a kid
                            const response = await axios.post(
                                joinPaths(process.env.APP_URL, '/me/mode/kids'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                }
                            );

                            if (response.data) {
                                const kid = response.data;
                                const randomGender = shuffleFunc(genders)[0];

                                // Update kid's gender
                                await axios.put(
                                    joinPaths(process.env.APP_URL, '/me/mode/kids'),
                                    {
                                        login_token: person.login_token,
                                        person_token: person.person_token,
                                        kid_token: kid.token,
                                        gender_token: randomGender.token,
                                        is_select: true,
                                    }
                                );

                                const randomAge = shuffleFunc(ageTokens)[0];

                                // Update kid's age
                                await axios.put(
                                    joinPaths(process.env.APP_URL, '/me/mode/kids'),
                                    {
                                        login_token: person.login_token,
                                        person_token: person.person_token,
                                        kid_token: kid.token,
                                        age_token: randomAge,
                                    }
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing mode for person ${person.person_token}:`, error.message);
                }

                processed++;
            })
        );
    }
}

async function processMovies() {
    console.log({ mock: 'movies' });
    let ts = timeNow();

    // Get top 1000 movies sorted by vote count
    const movies = await conn('movies')
        .whereNull('deleted')
        .orderBy('vote_count', 'desc')
        .limit(1000);

    // Get all movie genres
    const movieGenres = await conn('movie_genres')
        .whereNull('deleted');

    await helpers.processBatch(async (person) => {
        if (!helpers.isSectionActive(person, 'movies')) return;

        // Setup favorite position trackers
        const movieFavorites = helpers.favoritePositionTracker(person.sections.active.movies.items, 'movies');
        const genreFavorites = helpers.favoritePositionTracker(person.sections.active.movies.items, 'genres');

        // Add movies
        const selectedMovies = helpers.selectRandomItems(movies, 5, 15);
        await helpers.addSectionItems({
            person,
            sectionKey: 'movies',
            tableKey: 'movies',
            items: selectedMovies,
            favoriteTracker: movieFavorites,
            favoriteChance: 0.4
        });

        // Add genres
        const selectedGenres = helpers.selectRandomItems(movieGenres, 2, 5);

        await helpers.addSectionItems({
            person,
            sectionKey: 'movies',
            tableKey: 'genres',
            items: selectedGenres,
            favoriteTracker: genreFavorites,
            favoriteChance: 0.3
        });
    });

    console.log({ movies: timeNow() - ts });
}

async function processTvShows() {
    console.log({ mock: 'tv_shows' });
    let ts = timeNow();

    // Get top 1000 TV shows sorted by vote count
    const shows = await conn('tv_shows')
        .whereNull('deleted')
        .orderBy('vote_count', 'desc')
        .limit(1000);

    // Get all TV genres
    const tvGenres = await conn('tv_genres')
        .whereNull('deleted');

    await helpers.processBatch(async (person) => {
        if (!helpers.isSectionActive(person, 'tv_shows')) return;

        // Setup favorite position trackers
        const showFavorites = helpers.favoritePositionTracker(person.sections.active.tv_shows.items, 'shows');
        const genreFavorites = helpers.favoritePositionTracker(person.sections.active.tv_shows.items, 'genres');

        // Add shows
        const selectedShows = helpers.selectRandomItems(shows, 5, 15);
        await helpers.addSectionItems({
            person,
            sectionKey: 'tv_shows',
            tableKey: 'shows',
            items: selectedShows,
            favoriteTracker: showFavorites,
            favoriteChance: 0.4
        });

        // Add genres
        const selectedGenres = helpers.selectRandomItems(tvGenres, 2, 5);
        await helpers.addSectionItems({
            person,
            sectionKey: 'tv_shows',
            tableKey: 'genres',
            items: selectedGenres,
            favoriteTracker: genreFavorites,
            favoriteChance: 0.3
        });
    });

    console.log({ tv_shows: timeNow() - ts });
}

async function processSports() {
    console.log({ mock: 'sports' });

    let ts = timeNow();

    let test_country = await conn('open_countries')
        .where('country_code', 'US')
        .first();

    // Get active sports, leagues, and teams
    const sports = await conn('sports')
        .whereNull('deleted')
        .where('is_active', true);

    const leagues = await conn('sports_leagues AS sl')
        .join('sports_leagues_countries AS slc', 'slc.league_id', '=', 'sl.id')
        .where('country_id', test_country.id)
        .whereNull('sl.deleted')
        .where('sl.is_active', true)
        .select('sl.*', 'slc.position');

    const sportsTeams = await conn('sports_teams')
        .where('country_id', test_country.id)
        .whereNull('deleted')
        .where('is_active', true);

    let sportsSecondary = sectionsData.sports.secondary;

    await helpers.processBatch(async (person) => {
        if (!helpers.isSectionActive(person, 'sports')) return;

        // Setup favorite position trackers
        const playFavorites = helpers.favoritePositionTracker(person.sections.active.sports.items, 'play');
        const teamFavorites = helpers.favoritePositionTracker(person.sections.active.sports.items, 'teams');
        const leagueFavorites = helpers.favoritePositionTracker(person.sections.active.sports.items, 'leagues');

        // Add play sports
        const selectedPlaySports = helpers.selectRandomItems(sports.filter(s => s.is_play), 2, 5);
        await helpers.addSectionItems({
            person,
            sectionKey: 'sports',
            tableKey: 'play',
            items: selectedPlaySports,
            favoriteTracker: playFavorites,
            favoriteChance: 0.5,
            secondaryOptions: sportsSecondary.play.options
        });

        // Add teams
        const selectedTeams = helpers.selectRandomItems(sportsTeams, 3, 7);
        await helpers.addSectionItems({
            person,
            sectionKey: 'sports',
            tableKey: 'teams',
            items: selectedTeams,
            favoriteTracker: teamFavorites,
            favoriteChance: 0.5,
            secondaryOptions: sportsSecondary.teams.options
        });

        // Add leagues
        const selectedLeagues = helpers.selectRandomItems(leagues, 1, 3);
        await helpers.addSectionItems({
            person,
            sectionKey: 'sports',
            tableKey: 'leagues',
            items: selectedLeagues,
            favoriteTracker: leagueFavorites,
            favoriteChance: 0.5,
            secondaryOptions: sportsSecondary.leagues.options
        });
    });

    console.log({ sports: timeNow() - ts });
}

async function processMusic() {
    console.log({ mock: 'music' });
    let ts = timeNow();

    try {
        // Get top artists and active genres
        const artists = await conn('music_artists')
            .whereNull('deleted')
            .where('is_active', true)
            .orderBy('spotify_followers', 'desc')
            .limit(1000);

        const genres = await conn('music_genres')
            .whereNull('deleted')
            .where('is_active', true)
            .orderBy('position', 'asc');

        await helpers.processBatch(async (person) => {
            if (!helpers.isSectionActive(person, 'music')) return;

            // Setup favorite position trackers for both artists and genres
            const artistFavorites = helpers.favoritePositionTracker(
                person.sections.active.music.items,
                'artists'
            );
            const genreFavorites = helpers.favoritePositionTracker(
                person.sections.active.music.items,
                'genres'
            );

            // Add 5-15 random artists
            const selectedArtists = helpers.selectRandomItems(artists, 5, 15);
            await helpers.addSectionItems({
                person,
                sectionKey: 'music',
                tableKey: 'artists',
                items: selectedArtists,
                favoriteTracker: artistFavorites,
                favoriteChance: 0.5
            });

            // Add 3-7 random genres
            const selectedGenres = helpers.selectRandomItems(genres, 3, 7);
            await helpers.addSectionItems({
                person,
                sectionKey: 'music',
                tableKey: 'genres',
                items: selectedGenres,
                favoriteTracker: genreFavorites,
                favoriteChance: 0.5
            });
        });

    } catch (error) {
        console.error('Error processing music:', error);
    }

    console.log({ music: timeNow() - ts });
}

async function processInstruments() {
    console.log({ mock: 'instruments' });
    let ts = timeNow();

    try {
        // Get all instruments ordered by popularity
        const instruments = await conn('instruments')
            .where('is_active', true)
            .orderBy('popularity', 'desc')
            .limit(50);

        // Get skill level options from the section data
        const skillLevels = sectionsData.instruments.secondary.instruments.options;

        await helpers.processBatch(async (person) => {
            if (!helpers.isSectionActive(person, 'instruments')) return;

            // Add 1-2 random instruments
            const selectedInstruments = helpers.selectRandomItems(instruments, 1, 2);
            await helpers.addSectionItems({
                person,
                sectionKey: 'instruments',
                tableKey: 'instruments',
                items: selectedInstruments,
                secondaryOptions: skillLevels,
                secondaryChance: 0.7
            });
        });

    } catch (error) {
        console.error('Error processing instruments:', error);
    }

    console.log({ instruments: timeNow() - ts });
}

async function processSchools() {
    console.log({ mock: 'schools' });
    let ts = timeNow();

    try {
        // Get US as test country like in sports
        const test_country = await conn('open_countries')
            .where('country_code', 'US')
            .first();

        // Get schools for the test country ordered by student count
        const schools = await conn('schools')
            .where('country_id', test_country.id)
            .whereNull('deleted')
            .orderBy('student_count', 'desc')
            .select(
                'id',
                'token',
                'is_grade_school',
                'is_high_school',
                'is_college'
            ).limit(500)

        // Separate schools by type for balanced selection
        const collegeSchools = schools.filter(s => s.is_college);
        const highSchools = schools.filter(s => s.is_high_school);
        const gradeSchools = schools.filter(s => s.is_grade_school);

        await helpers.processBatch(async (person) => {
            if (!helpers.isSectionActive(person, 'schools')) return;

            // Randomly decide which types of schools to add
            const addCollege = Math.random() > 0.2; // 80% chance for college
            const addHighSchool = Math.random() > 0.3; // 70% chance for high school
            const addGradeSchool = Math.random() > 0.5; // 50% chance for grade school

            // Add 1-2 colleges if selected
            if (addCollege) {
                const selectedColleges = helpers.selectRandomItems(collegeSchools, 1, 2);
                await helpers.addSectionItems({
                    person,
                    sectionKey: 'schools',
                    tableKey: 'schools',
                    items: selectedColleges,
                    hashToken: test_country.country_code
                });
            }

            // Add 1 high school if selected
            if (addHighSchool) {
                const selectedHighSchools = helpers.selectRandomItems(highSchools, 1, 1);
                await helpers.addSectionItems({
                    person,
                    sectionKey: 'schools',
                    tableKey: 'schools',
                    items: selectedHighSchools,
                    hashToken: test_country.country_code
                });
            }

            // Add 1 grade school if selected
            if (addGradeSchool) {
                const selectedGradeSchools = helpers.selectRandomItems(gradeSchools, 1, 1);
                await helpers.addSectionItems({
                    person,
                    sectionKey: 'schools',
                    tableKey: 'schools',
                    items: selectedGradeSchools,
                    hashToken: test_country.country_code
                });
            }
        });

    } catch (error) {
        console.error('Error processing schools:', error);
    }

    console.log({ schools: timeNow() - ts });
}

(async function () {
    conn = await dbService.conn();
    self_network = await getNetworkSelf();

    if (!self_network) {
        console.error(
            'Network not setup: 1) Setup system: node setup 2) Start server: node server.js',
        );
        process.exit(1);
    }

    await getPersonsLogins();

    //sections
    await processSections();

    //mode
    await processModes();

    //movies
    await processMovies();

    //tv shows
    await processTvShows();

    //sports
    await processSports();

    //music
    await processMusic();

    //instruments
    await processInstruments();

    //schools
    await processSchools();

    //work

    //life stage

    //relationship status

    //languages

    //politics

    //religion

    //drinking

    //smoking

    process.exit();
})();
