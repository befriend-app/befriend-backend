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
    console.log({
        mock: 'movies'
    });

    let ts = timeNow();

    // Get top 1000 movies sorted by vote count
    const movies = await conn('movies')
        .whereNull('deleted')
        .orderBy('vote_count', 'desc')
        .limit(1000);

    // Get all movie genres
    const movieGenres = await conn('movie_genres')
        .whereNull('deleted');

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

                //only add movies if section added
                if(!person.sections.active.movies) {
                    processed++;
                    return;
                }

                try {
                    // Add 5-15 random movies for each person
                    const numMovies = Math.floor(Math.random() * 11) + 5;
                    const selectedMovies = shuffleFunc([...movies]).slice(0, numMovies);

                    let prevFavoriteMoviesPosition = Object.values(person.sections.active.movies.items)
                        .reduce((acc, movie) => {
                            if(movie.table_key === 'movies') {
                                if(movie.is_favorite && movie.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let prevFavoriteGenresPosition = Object.values(person.sections.active.movies.items)
                        .reduce((acc, item) => {
                            if(item.table_key === 'genres') {
                                if(item.is_favorite && item.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let favoriteMoviesPosition = prevFavoriteMoviesPosition || 0;
                    let favoriteGenresPosition = prevFavoriteGenresPosition || 0;

                    for (const movie of selectedMovies) {
                        //skip if movie already added
                        if(movie.token in person.sections.active.movies?.items) {
                            continue;
                        }

                        // 40% chance to mark as favorite
                        const isFavorite = Math.random() > 0.6;

                        // Add movie to person's collection
                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'movies',
                                table_key: 'movies',
                                item_token: movie.token
                            }
                        );

                        if (isFavorite) {
                            // Mark as favorite if selected
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'movies',
                                    table_key: 'movies',
                                    section_item_id: r.data.id,
                                    favorite: {
                                        active: true,
                                        position: favoriteMoviesPosition++
                                    }
                                }
                            );
                        }
                    }

                    // Add 2-5 random genres
                    const numGenres = Math.floor(Math.random() * 4) + 2;
                    const selectedGenres = shuffleFunc([...movieGenres]).slice(0, numGenres);

                    for (const genre of selectedGenres) {
                        if(genre.token in person.sections.active.movies?.items) {
                            continue;
                        }

                        const isGenreFavorite = Math.random() > 0.7;

                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'movies',
                                table_key: 'genres',
                                item_token: genre.token
                            }
                        );

                        if (isGenreFavorite) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'movies',
                                    table_key: 'genres',
                                    section_item_id: r.data.id,
                                    favorite: {
                                        active: true,
                                        position: favoriteGenresPosition++
                                    }
                                }
                            );
                        }
                    }

                } catch (error) {
                    console.error(`Error processing movies for person ${person.person_token}:`, error.message);
                }

                processed++;
            })
        );
    }

    console.log({
        movies: timeNow() - ts
    });
}

async function processTvShows() {
    console.log({
        mock: 'tv_shows'
    });

    let ts = timeNow();

    // Get top 1000 TV shows sorted by vote count
    const shows = await conn('tv_shows')
        .whereNull('deleted')
        .orderBy('vote_count', 'desc')
        .limit(1000);

    // Get all TV genres
    const tvGenres = await conn('tv_genres')
        .whereNull('deleted');

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

                //only add tv shows if section added
                if(!person.sections.active.tv_shows) {
                    processed++;
                    return;
                }

                try {
                    // Add 5-15 random shows for each person
                    const numShows = Math.floor(Math.random() * 11) + 5;
                    const selectedShows = shuffleFunc([...shows]).slice(0, numShows);

                    let prevFavoriteShowsPosition = Object.values(person.sections.active.tv_shows.items)
                        .reduce((acc, show) => {
                            if(show.table_key === 'shows') {
                                if(show.is_favorite && show.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let prevFavoriteGenresPosition = Object.values(person.sections.active.tv_shows.items)
                        .reduce((acc, item) => {
                            if(item.table_key === 'genres') {
                                if(item.is_favorite && item.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let favoriteShowsPosition = prevFavoriteShowsPosition || 0;
                    let favoriteGenresPosition = prevFavoriteGenresPosition || 0;

                    for (const show of selectedShows) {
                        //skip if show already added
                        if(show.token in person.sections.active.tv_shows?.items) {
                            continue;
                        }

                        // 40% chance to mark as favorite
                        const isFavorite = Math.random() > 0.6;

                        // Add show to person's collection
                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'tv_shows',
                                table_key: 'shows',
                                item_token: show.token
                            }
                        );

                        if (isFavorite) {
                            // Mark as favorite if selected
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'tv_shows',
                                    table_key: 'shows',
                                    section_item_id: r.data.id,
                                    favorite: {
                                        active: true,
                                        position: favoriteShowsPosition++
                                    }
                                }
                            );
                        }
                    }

                    // Add 2-5 random genres
                    const numGenres = Math.floor(Math.random() * 4) + 2;
                    const selectedGenres = shuffleFunc([...tvGenres]).slice(0, numGenres);

                    for (const genre of selectedGenres) {
                        if(genre.token in person.sections.active.tv_shows?.items) {
                            continue;
                        }

                        const isGenreFavorite = Math.random() > 0.7;

                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'tv_shows',
                                table_key: 'genres',
                                item_token: genre.token
                            }
                        );

                        if (isGenreFavorite) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'tv_shows',
                                    table_key: 'genres',
                                    section_item_id: r.data.id,
                                    favorite: {
                                        active: true,
                                        position: favoriteGenresPosition++
                                    }
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.error(`Error processing tv shows for person ${person.person_token}:`, error.message);
                }

                processed++;
            })
        );
    }

    console.log({
        tv_shows: timeNow() - ts
    });
}

async function processSports() {
    console.log({
        mock: 'sports'
    });

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

                //only add sports if section added
                if(!person.sections.active.sports) {
                    processed++;
                    return;
                }

                try {
                    // Get current favorite positions for each category
                    let prevFavoritePlayPosition = Object.values(person.sections.active.sports.items)
                        .reduce((acc, item) => {
                            if(item.table_key === 'play') {
                                if(item.is_favorite && item.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let prevFavoriteTeamsPosition = Object.values(person.sections.active.sports.items)
                        .reduce((acc, item) => {
                            if(item.table_key === 'teams') {
                                if(item.is_favorite && item.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let prevFavoriteLeaguesPosition = Object.values(person.sections.active.sports.items)
                        .reduce((acc, item) => {
                            if(item.table_key === 'leagues') {
                                if(item.is_favorite && item.favorite_position >= acc) {
                                    return acc + 1;
                                }
                            }
                            return acc;
                        }, 0);

                    let favoritePlayPosition = prevFavoritePlayPosition || 0;
                    let favoriteTeamsPosition = prevFavoriteTeamsPosition || 0;
                    let favoriteLeaguesPosition = prevFavoriteLeaguesPosition || 0;

                    // Add 2-5 play sports
                    const numPlaySports = Math.floor(Math.random() * 4) + 2;
                    const selectedPlaySports = shuffleFunc(sports.filter(s => s.is_play)).slice(0, numPlaySports);

                    for (const sport of selectedPlaySports) {
                        if(sport.token in person.sections.active.sports?.items) {
                            continue;
                        }

                        const isFavorite = Math.random() > 0.5;

                        const addSecondary = Math.random() > 0.6;
                        const secondaryValue = addSecondary ? shuffleFunc(sportsSecondary.play.options)[0] : null;

                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'sports',
                                table_key: 'play',
                                item_token: sport.token
                            }
                        );

                        if (isFavorite || secondaryValue) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'sports',
                                    table_key: 'play',
                                    section_item_id: r.data.id,
                                    ...(isFavorite && {
                                        favorite: {
                                            active: true,
                                            position: favoritePlayPosition++
                                        }
                                    }),
                                    ...(secondaryValue && { secondary: secondaryValue }),
                                }
                            );
                        }
                    }

                    // Add 3-7 teams
                    const numTeams = Math.floor(Math.random() * 5) + 3;
                    const selectedTeams = shuffleFunc([...sportsTeams]).slice(0, numTeams);

                    for (const team of selectedTeams) {
                        if(team.token in person.sections.active.sports?.items) {
                            continue;
                        }

                        const isFavorite = Math.random() > 0.5;

                        const addSecondary = Math.random() > 0.6;
                        const secondaryValue = addSecondary ? shuffleFunc(sportsSecondary.teams.options)[0] : null;

                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'sports',
                                table_key: 'teams',
                                item_token: team.token
                            }
                        );

                        if (isFavorite || secondaryValue) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'sports',
                                    table_key: 'teams',
                                    section_item_id: r.data.id,
                                    ...(isFavorite && {
                                        favorite: {
                                            active: true,
                                            position: favoritePlayPosition++
                                        }
                                    }),
                                    ...(secondaryValue && { secondary: secondaryValue }),
                                }
                            );
                        }
                    }

                    // Add 1-3 leagues
                    const numLeagues = Math.floor(Math.random() * 3) + 1;
                    const selectedLeagues = shuffleFunc([...leagues]).slice(0, numLeagues);

                    for (const league of selectedLeagues) {
                        if(league.token in person.sections.active.sports?.items) {
                            continue;
                        }

                        // 50% chance to mark as favorite
                        const isFavorite = Math.random() > 0.5;
                        const addSecondary = Math.random() > 0.6;
                        const secondaryValue = addSecondary ? shuffleFunc(sportsSecondary.leagues.options)[0] : null;

                        let r = await axios.post(
                            joinPaths(process.env.APP_URL, '/me/sections/items'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                section_key: 'sports',
                                table_key: 'leagues',
                                item_token: league.token
                            }
                        );

                        if (isFavorite || secondaryValue) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/me/sections/items'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    section_key: 'sports',
                                    table_key: 'leagues',
                                    section_item_id: r.data.id,
                                    ...(isFavorite && {
                                        favorite: {
                                            active: true,
                                            position: favoritePlayPosition++
                                        }
                                    }),
                                    ...(secondaryValue && { secondary: secondaryValue }),
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.error(`Error processing sports for person ${person.person_token}:`, error.message);
                }

                processed++;
            })
        );
    }

    console.log({
        sports: timeNow() - ts
    });
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
    // await processModes();

    //movies
    // await processMovies();

    //tv shows
    // await processTvShows();

    //sports
    await processSports();

    //music

    //instruments

    //schools

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
