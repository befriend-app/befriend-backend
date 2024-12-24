const axios = require('axios');
const yargs = require('yargs');

const dbService = require('../../services/db');
const { getNetworkSelf } = require('../../services/network');
const { loadScriptEnv, timeNow, joinPaths, shuffleFunc } = require('../../services/shared');
const { filterMappings, getFilters } = require('../../services/filters');
const { getActivityTypes } = require('../../services/activities');
const { getModes } = require('../../services/modes');
const { getGendersLookup } = require('../../services/genders');
const sectionsData = require('../../services/sections_data');
const meService = require('../../services/me');

loadScriptEnv();

let conn, self_network, persons;

let args = yargs.argv;

let num_persons = 1000;
let parallelCount = 30;

if (args._ && args._.length) {
    num_persons = args._[0];
}

let chunks = [];
let personsLookup = {};

let ignoreKeys = ['verification_dl', 'verification_cc', 'verification_video', 'sports_play', 'sports_leagues', 'sports_teams', 'movie_genres', 'tv_show_genres', 'music_artists', 'music_genres', 'work_industries', 'work_roles'];

const helpers = {
    processBatch: async function (processFn) {
        let processed = 0;
        const total = persons.length;

        for (let chunk of chunks) {
            await Promise.all(
                chunk.map(async (person) => {
                    if (processed % 100 === 0) {
                        console.log({
                            processing: `${processed + 1}/${total}`,
                        });
                    }

                    processed++;

                    try {
                        await processFn(person);
                    } catch (error) {
                        console.error(
                            `Error processing person ${person.person_token}:`,
                            error.message,
                        );
                    }
                }),
            );
        }
    },
};

async function getPersonsLogins() {
    console.log({
        filter: 'logins',
    });

    let ts = timeNow();

    persons = await conn('persons').where('network_id', self_network.id).limit(num_persons);

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
                if (processed % 100 === 0) {
                    console.log({
                        processing: `${processed + 1}/${persons.length}`,
                    });
                }

                processed++;

                if (!persons_dict[person.id]) {
                    try {
                        let r = await axios.post(joinPaths(process.env.APP_URL, 'login'), {
                            email: person.email,
                            password: 'password',
                        });
                        persons_dict[person.id] = r.data.login_token;
                        person.login_token = r.data.login_token;
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    person.login_token = persons_dict[person.id];
                }

                personsLookup[person.id] = {
                    person_token: person.person_token,
                    login_token: person.login_token,
                }
            }),
        );
    }

    console.log({
        logins: timeNow() - ts,
    });
}

async function processActive() {
    console.log({
        filter: 'active_filter',
    });

    let ts = timeNow();

    await helpers.processBatch(async (person) => {
        // Randomly activate/deactivate filters
        for (let filterKey in filterMappings) {
            if(ignoreKeys.includes(filterKey)) {
                continue;
            }

            // 70% chance to have each filter active
            let isActive = Math.random() > 0.3;

            try {
                await axios.put(joinPaths(process.env.APP_URL, '/filters/active'), {
                    login_token: person.login_token,
                    person_token: person.person_token,
                    filter_token: filterKey,
                    active: isActive,
                });
            } catch (error) {
                console.error(`Error activating filter ${filterKey}:`, error.message);
            }
        }
    });

    console.log({
        active_filter: timeNow() - ts,
    });
}

async function processSendReceive() {
    console.log({
        filter: 'send_receive_filter',
    });

    let ts = timeNow();

    await helpers.processBatch(async (person) => {
        for (let filterKey in filterMappings) {
            if(ignoreKeys.includes(filterKey)) {
                continue;
            }

            // 80% chance to enable each direction
            let isEnabled = Math.random() > 0.2;

            try {
                await axios.put(joinPaths(process.env.APP_URL, '/filters/send-receive'), {
                    login_token: person.login_token,
                    person_token: person.person_token,
                    filter_token: filterKey,
                    type: Math.random() > 0.5 ? 'send' : 'receive',
                    enabled: isEnabled,
                });
            } catch (error) {
                console.error(`Error setting send/receive for ${filterKey}:`, error.message);
            }
        }
    });

    console.log({
        send_receive_filter: timeNow() - ts,
    });
}

async function processImportance() {
    console.log({
        process: 'importance'
    });

    let conn = await dbService.conn();

    let filters = await getFilters();

    let importance_cols = Object.values(filterMappings).filter(item => item.importance && item.column).map(item => item.column);

    let items = await conn('persons_filters');

    let process_chunks = [];

    for(let i = 0; i < items.length; i += parallelCount) {
        process_chunks.push(items.slice(i, i + parallelCount));
    }

    let processed = 0;

    for(let chunk of process_chunks) {
        await Promise.all(
            chunk.map(async (item) => {
                if (processed % 100 === 0) {
                    console.log({
                        processing: `${processed + 1}/${items.length}`,
                    });
                }

                processed++;

                try {
                    let item_has_col = importance_cols.some(col => item[col]);

                    if(!item_has_col) {
                        return;
                    }

                    let filter = filters.byId[item.filter_id];

                    if(!filter) {
                        console.error("No filter found");
                        return;
                    }

                    let person = personsLookup[item.person_id];

                    if(!person) {
                        console.error("No person found");
                        return;
                    }

                    if(Math.random() > 0.3) { //70% chance of setting importance
                        let importance = Math.random() < 0.8 //skewed towards higher importance
                            ? Math.floor(Math.random() * 6) + 5
                            : Math.floor(Math.random() * 5) + 2;

                        let section = filter.token;

                        if(section.startsWith('movie')) {
                            section = 'movies';
                        } else if(section.startsWith('tv')) {
                            section = 'tv_shows';
                        } else if(section.startsWith('sport')) {
                            section = 'sports'
                        } else if(section.startsWith('music')) {
                            section = 'music';
                        } else if(section.startsWith('work')) {
                            section = 'work';
                        }

                        let r = await axios.put(joinPaths(process.env.APP_URL, '/filters/importance'), {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            filter_item_id: item.id,
                            section: section,
                            importance: Math.min(importance, 10)
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }),
        );
    }
}

async function processAvailability() {
    console.log({ filter: 'availability_filter' });
    let ts = timeNow();

    // Default time slots that could be assigned
    const timeSlots = [
        { start: '09:00', end: '12:00' },
        { start: '12:00', end: '17:00' },
        { start: '17:00', end: '21:00' },
        { start: '19:00', end: '23:00' },
    ];

    // Late night/overnight slots
    const overnightSlots = [
        { start: '20:00', end: '02:00' },
        { start: '22:00', end: '04:00' },
    ];

    await helpers.processBatch(async (person) => {
        try {
            // Build availability data structure
            let availability = {};

            // Process each day (0 = Sunday through 6 = Saturday)
            for (let day = 0; day < 7; day++) {
                // 80% chance to have availability for each day
                if (Math.random() > 0.2) {
                    availability[day] = {
                        isDisabled: false, // Day is enabled
                        times: {},
                    };

                    // 30% chance to set "any time" for the day
                    if (Math.random() <= 0.3) {
                        availability[day].isAny = true;
                    } else {
                        // Otherwise add 1-3 specific time slots
                        const numSlots = Math.floor(Math.random() * 3) + 1;

                        // Weekend days (0 and 6) have 25% chance for overnight slots
                        const slotPool =
                            (day === 0 || day === 6) && Math.random() < 0.25
                                ? timeSlots.concat(overnightSlots)
                                : timeSlots;

                        // Select random slots
                        const selectedSlots = shuffleFunc([...slotPool])
                            .slice(0, numSlots)
                            .sort((a, b) => a.start.localeCompare(b.start));

                        // Add each time slot with a unique ID
                        for (let index = 0; index < selectedSlots.length; index++) {
                            let slot = selectedSlots[index];

                            availability[day].times[`time_${day}_${index}`] = {
                                start: slot.start,
                                end: slot.end,
                            };
                        }
                    }
                } else {
                    // Day is disabled
                    availability[day] = {
                        isDisabled: true,
                    };
                }
            }

            // Send the availability update request
            await axios.put(joinPaths(process.env.APP_URL, '/filters/availability'), {
                login_token: person.login_token,
                person_token: person.person_token,
                availability: availability,
            });
        } catch (error) {
            console.error(
                `Error setting availability for person ${person.person_token}:`,
                error.message,
            );
        }
    });

    console.log({
        availability_filter: timeNow() - ts,
    });
}

async function processActivityTypes() {
    console.log({ filter: 'activity_types' });
    let ts = timeNow();

    let activityTypes = await getActivityTypes();

    await helpers.processBatch(async (person) => {
        try {
            // Get current level 1 activities to work with
            let level1Activities = {};
            for (let id in activityTypes) {
                let activity = activityTypes[id];
                if (activity.name.toLowerCase() !== 'any') {
                    level1Activities[id] = activity;
                }
            }

            // Track which activities to update
            let updateTokens = {};

            // 70% chance to deactivate some activities
            if (Math.random() <= 0.7) {
                // Randomly select 1-3 level 1 activities to deactivate
                const numToDeactivate = Math.floor(Math.random() * 3) + 1;
                const level1Ids = Object.keys(level1Activities);
                const selectedIds = shuffleFunc([...level1Ids]).slice(0, numToDeactivate);

                for (let id of selectedIds) {
                    let activity = level1Activities[id];
                    updateTokens[activity.token] = false;

                    // If activity has sub-categories, randomly deactivate some of those too
                    if (activity.sub) {
                        for (let subId in activity.sub) {
                            let subActivity = activity.sub[subId];
                            if (subActivity.name.toLowerCase() !== 'any' && Math.random() > 0.5) {
                                updateTokens[subActivity.token] = false;

                                // For level 3 activities
                                if (subActivity.sub) {
                                    for (let level3Id in subActivity.sub) {
                                        let level3Activity = subActivity.sub[level3Id];
                                        if (level3Activity.name.toLowerCase() !== 'any' && Math.random() > 0.5) {
                                            updateTokens[level3Activity.token] = false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Make the update request if we have tokens to update
            if (Object.keys(updateTokens).length > 0) {
                await axios.put(
                    joinPaths(process.env.APP_URL, '/filters/activity-types'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        activities: updateTokens,
                        active: false
                    }
                );
            }

            // 50% chance to explicitly activate some activities
            if (Math.random() > 0.5) {
                updateTokens = {};
                const level1Ids = Object.keys(level1Activities);
                const numToActivate = Math.floor(Math.random() * 3) + 1;
                const selectedIds = shuffleFunc([...level1Ids]).slice(0, numToActivate);

                for (let id of selectedIds) {
                    let activity = level1Activities[id];
                    updateTokens[activity.token] = true;

                    // If activity has sub-categories, randomly activate some
                    if (activity.sub) {
                        for (let subId in activity.sub) {
                            let subActivity = activity.sub[subId];
                            if (subActivity.name.toLowerCase() !== 'any' && Math.random() > 0.3) {
                                updateTokens[subActivity.token] = true;

                                // For level 3 activities
                                if (subActivity.sub) {
                                    for (let level3Id in subActivity.sub) {
                                        let level3Activity = subActivity.sub[level3Id];
                                        if (level3Activity.name.toLowerCase() !== 'any' && Math.random() > 0.3) {
                                            updateTokens[level3Activity.token] = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (Object.keys(updateTokens).length > 0) {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/activity-types'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            activities: updateTokens,
                            active: true
                        }
                    );
                }
            }

            // 20% chance to set all activities to active
            if (Math.random() <= 0.2) {
                await axios.put(
                    joinPaths(process.env.APP_URL, '/filters/activity-types'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        activities: { all: true },
                        active: true
                    }
                );
            }
        } catch (error) {
            console.error(`Error processing activity types for person ${person.person_token}:`, error.message);
        }
    });

    console.log({
        activity_types: timeNow() - ts
    });
}

async function processModes() {
    console.log({ filter: 'modes' });
    let ts = timeNow();

    let modes = await getModes();

    modes = Object.values(modes.byId);

    await helpers.processBatch(async (person) => {
        try {
            // 80% chance to set mode filter settings for each person
            if (Math.random() > 0.2) {

                // Select 1-3 random modes to activate
                let numModes = Math.floor(Math.random() * 3) + 1;
                let selectedModes = shuffleFunc([...modes]).slice(0, numModes);

                // Process each selected mode
                for (let mode of selectedModes) {
                    try {
                        // Activate the mode
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/modes'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                mode_token: mode.token,
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error(`Error setting mode ${mode.token} for person ${person.person_token}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing modes filter for person ${person.person_token}:`, error.message);
        }
    });

    console.log({
        modes: timeNow() - ts
    });
}

async function processNetworks() {
    console.log({
        filter: 'networks_filter',
    });

    let ts = timeNow();

    await helpers.processBatch(async (person) => {
        try {
            // 30% chance to select any network
            if (Math.random() <= 0.3) {
                await axios.put(joinPaths(process.env.APP_URL, '/filters/networks'), {
                    login_token: person.login_token,
                    person_token: person.person_token,
                    network_token: 'any',
                    is_any_network: true,
                    active: true
                });
            } else {
                // 40% chance to require verified networks
                if (Math.random() <= 0.4) {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/networks'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        network_token: 'any_verified',
                        is_all_verified: true,
                        active: true
                    });
                }
            }
        } catch (error) {
            console.error('Error setting network filter:', error.message);
        }
    });

    console.log({
        networks_filter: timeNow() - ts,
    });
}

async function processReviews() {
    console.log({
        filter: 'reviews_filter',
    });

    let ts = timeNow();

    const reviewTypes = [
        'reviews_safety',
        'reviews_trust',
        'reviews_timeliness',
        'reviews_friendliness',
        'reviews_fun',
    ];

    const generateRating = () => {
        // Generate base rating biased towards higher numbers (3-5)
        const baseRating = Math.random() < 0.8
            ? Math.random() * 2 + 3
            : Math.random() * 3 + 1

        // Round to 1 decimal place
        return Math.round(baseRating * 10) / 10;
    }

    await helpers.processBatch(async (person) => {
        //new members
        let includeNew = Math.random() > 0.3;

        //70% chance of enabling new member matches
        try {
            await axios.put(joinPaths(process.env.APP_URL, '/filters/active'), {
                login_token: person.login_token,
                person_token: person.person_token,
                filter_token: 'reviews_new',
                active: includeNew
            });
        } catch (error) {
            console.error(`Error setting unrated:`, error.message);
        }

        //1 -5 stars
        for (let reviewType of reviewTypes) {
            if (Math.random() > 0.4) {
                // 60% chance to set each review filter
                const rating = generateRating();

                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/reviews'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        filter_token: reviewType,
                        rating: rating,
                    });
                } catch (error) {
                    console.error(`Error setting ${reviewType} filter:`, error.message);
                }
            }
        }
    });

    console.log({
        reviews_filter: timeNow() - ts,
    });
}

async function processVerifications() {
    console.log({ filter: 'verifications' });
    let ts = timeNow();

    const verificationTypes = [
        'verification_in_person',
        'verification_linkedin',
    ];

    await helpers.processBatch(async (person) => {
        try {
            for(let verification of verificationTypes) {
                let isActive = Math.random() > 0.5; //50% chance of enabling

                await axios.put(
                    joinPaths(process.env.APP_URL, '/filters/active'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        filter_token: verification,
                        active: isActive
                    }
                );
            }
        } catch (error) {
            console.error(`Error processing verifications for person ${person.person_token}:`, error.message);
        }
    });

    console.log({
        verifications: timeNow() - ts
    });
}

async function processDistance() {
    console.log({
        filter: 'distance_filter',
    });

    let ts = timeNow();

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) {
            // 70% chance to set distance filter
            const distance = Math.floor(Math.random() * 59) + 1; // 1-60 miles/km

            try {
                await axios.put(joinPaths(process.env.APP_URL, '/filters/distance'), {
                    login_token: person.login_token,
                    person_token: person.person_token,
                    distance: distance,
                });
            } catch (error) {
                console.error('Error setting distance filter:', error.message);
            }
        }
    });

    console.log({
        distance_filter: timeNow() - ts,
    });
}

async function processAge() {
    console.log({
        filter: 'age_filter',
    });

    let ts = timeNow();

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) {
            // 70% chance to set age filter
            const minAge = Math.floor(Math.random() * 20) + 18; // 18-37
            const maxAge = Math.floor(Math.random() * 40) + minAge; // minAge + (1-40)

            try {
                await axios.put(joinPaths(process.env.APP_URL, '/filters/age'), {
                    login_token: person.login_token,
                    person_token: person.person_token,
                    min_age: minAge,
                    max_age: Math.min(maxAge, 80),
                });
            } catch (error) {
                console.error('Error setting age filter:', error.message);
            }
        }
    });

    console.log({
        age_filter: timeNow() - ts,
    });
}

async function processGender() {
    console.log({
        filter: 'genders_filter',
    });

    let ts = timeNow();

    let genders = await getGendersLookup();

    genders = Object.values(genders.byId);

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) {
            // 70% chance to set gender filters
            // 30% chance to select 'any'
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/gender'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        gender_token: 'any',
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting any gender filter:', error.message);
                }
            } else {
                // Set specific genders
                const selectedGenders = shuffleFunc(genders).slice(
                    0,
                    Math.random() > 0.5 ? 2 : 1,
                );

                for (let gender of selectedGenders) {
                    try {
                        await axios.put(joinPaths(process.env.APP_URL, '/filters/gender'), {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            gender_token: gender.gender_token,
                            active: true,
                        });
                    } catch (error) {
                        console.error(
                            `Error setting gender filter for ${gender.gender_token}:`,
                            error.message,
                        );
                    }
                }
            }
        }
    });

    console.log({
        genders_filter: timeNow() - ts,
    });
}

async function processMovies() {
    console.log({ filter: 'movies' });
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
        try {
            // Process movies
            // Select 5-15 random movies
            const selectedMovies = shuffleFunc([...movies])
                .slice(0, Math.floor(Math.random() * 11) + 5);

            for (const movie of selectedMovies) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/movies'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'movies',
                            token: movie.token,
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error processing movie ${movie.token}:`, error.message);
                }
            }

            // Process genres
            // Select 2-5 random genres
            const selectedGenres = shuffleFunc([...movieGenres])
                .slice(0, Math.floor(Math.random() * 4) + 2);

            for (const genre of selectedGenres) {
                genre.type = 'genre';

                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/movies'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'genres',
                            token: genre.token,
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error processing genre ${genre.token}:`, error.message);
                }
            }

            // 20% chance to deactivate some selections randomly
            if (Math.random() <= 0.2) {
                const itemsToDeactivate = [...selectedMovies, ...selectedGenres]
                    .filter(() => Math.random() > 0.7); // 30% chance to select each item

                for (const item of itemsToDeactivate) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/movies'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: item.type === 'genre' ? 'genres' : 'movies',
                                token: item.token,
                                active: false
                            }
                        );
                    } catch (error) {
                        console.error(`Error deactivating item ${item.token}:`, error.message);
                    }
                }
            }

            if (Math.random() <= 0.3) { // 30% chance to set any on movies
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/movies'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'movies',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error setting any movie:`, error.message);
                }
            }

            if (Math.random() <= 0.3) { // 30% chance to set any on genres
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/movies'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'genres',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error setting any movie:`, error.message);
                }
            }
        } catch (error) {
            console.error(`Error processing movies for person ${person.person_token}:`, error.message);
        }
    });

    console.log({
        movies: timeNow() - ts
    });
}

async function processTvShows() {
    console.log({ filter: 'tv_shows' });
    let ts = timeNow();

    // Get top 1000 TV shows sorted by vote count
    const shows = await conn('tv_shows')
        .whereNull('deleted')
        .orderBy('vote_count', 'desc')
        .limit(1000);

    // Get all TV show genres
    const tvGenres = await conn('tv_genres')
        .whereNull('deleted');

    await helpers.processBatch(async (person) => {
        try {
            // Process TV shows
            // Select 5-15 random shows
            const selectedShows = shuffleFunc([...shows])
                .slice(0, Math.floor(Math.random() * 11) + 5);

            for (const show of selectedShows) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/tv-shows'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'shows',
                            token: show.token,
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error processing TV show ${show.token}:`, error.message);
                }
            }

            // Process genres
            // Select 2-5 random genres
            const selectedGenres = shuffleFunc([...tvGenres])
                .slice(0, Math.floor(Math.random() * 4) + 2);

            for (const genre of selectedGenres) {
                genre.type = 'genre';

                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/tv-shows'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'genres',
                            token: genre.token,
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error processing genre ${genre.token}:`, error.message);
                }
            }

            // 20% chance to deactivate some selections randomly
            if (Math.random() <= 0.2) {
                const itemsToDeactivate = [...selectedShows, ...selectedGenres]
                    .filter(() => Math.random() > 0.7); // 30% chance to select each item

                for (const item of itemsToDeactivate) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/tv-shows'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: item.type === 'genre' ? 'genres' : 'shows',
                                token: item.token,
                                active: false
                            }
                        );
                    } catch (error) {
                        console.error(`Error deactivating item ${item.token}:`, error.message);
                    }
                }
            }

            // 30% chance to set any on shows
            if (Math.random() <= 0.25) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/tv-shows'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'shows',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error setting any show:`, error.message);
                }
            }

            // 30% chance to set any on genres
            if (Math.random() <= 0.25) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/tv-shows'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'genres',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error(`Error setting any genre:`, error.message);
                }
            }
        } catch (error) {
            console.error(`Error processing TV shows for person ${person.person_token}:`, error.message);
        }
    });

    console.log({
        tv_shows: timeNow() - ts
    });
}

async function processSports() {
    console.log({ filter: 'sports' });
    let ts = timeNow();

    try {
        const test_country = await conn('open_countries')
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

        // Get secondary options from sections data
        const secondaryOptions = sectionsData.sports.secondary;

        await helpers.processBatch(async (person) => {
            try {
                // Process play sports
                // Select 2-5 random play sports
                const selectedPlaySports = shuffleFunc(sports.filter(s => s.is_play))
                    .slice(0, Math.floor(Math.random() * 4) + 2);

                for (const sport of selectedPlaySports) {
                    sport.type = 'play';

                    try {
                        // 40% chance to add secondary level
                        const addSecondary = Math.random() > 0.6;

                        let numSecondaries = Math.floor(Math.random() * 3) + 1;

                        let secondary = shuffleFunc(secondaryOptions.play.options)
                            .slice(0, numSecondaries);

                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/sports'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'play',
                                token: sport.token,
                                active: true
                            }
                        );

                        if(addSecondary) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/sports'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: 'play',
                                    token: sport.token,
                                    secondary
                                }
                            );
                        }
                    } catch (error) {
                        console.error(`Error processing play sport ${sport.token}:`, error.message);
                    }
                }

                // Process teams
                // Select 3-7 random teams
                const selectedTeams = shuffleFunc([...sportsTeams])
                    .slice(0, Math.floor(Math.random() * 5) + 3);

                for (const team of selectedTeams) {
                    team.type = 'team';

                    try {
                        // 60% chance to add secondary fan level
                        const addSecondary = Math.random() > 0.4;

                        let numSecondaries = Math.floor(Math.random() * 3) + 1;

                        let secondary = shuffleFunc(secondaryOptions.teams.options)
                            .slice(0, numSecondaries);

                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/sports'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'teams',
                                token: team.token,
                                active: true,
                            }
                        );

                        if(addSecondary) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/sports'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: 'teams',
                                    token: team.token,
                                    secondary
                                }
                            );
                        }
                    } catch (error) {
                        console.error(`Error processing team ${team.token}:`, error.message);
                    }
                }

                // Process leagues
                // Select 1-3 random leagues
                const selectedLeagues = shuffleFunc([...leagues])
                    .slice(0, Math.floor(Math.random() * 3) + 1);

                for (const league of selectedLeagues) {
                    league.type = 'league';

                    try {
                        // 60% chance to add secondary fan level
                        const addSecondary = Math.random() > 0.4;
                        let numSecondaries = Math.floor(Math.random() * 3) + 1;

                        let secondary = shuffleFunc(secondaryOptions.leagues.options)
                            .slice(0, numSecondaries);

                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/sports'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'leagues',
                                token: league.token,
                                active: true,
                            }
                        );

                        if(addSecondary) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/sports'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: 'leagues',
                                    token: league.token,
                                    secondary
                                }
                            );
                        }
                    } catch (error) {
                        console.error(`Error processing league ${league.token}:`, error.message);
                    }
                }

                // 20% chance to deactivate some selections randomly
                if (Math.random() <= 0.2) {
                    const itemsToDeactivate = [
                        ...selectedPlaySports,
                        ...selectedTeams,
                        ...selectedLeagues
                    ].filter(() => Math.random() > 0.7); // 30% chance to select each item

                    for (const item of itemsToDeactivate) {
                        try {
                            const tableKey = item.type === 'play' ? 'play' :
                                (item.type === 'league' ? 'leagues' : 'teams');

                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/sports'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: tableKey,
                                    token: item.token,
                                    active: false
                                }
                            );
                        } catch (error) {
                            console.error(`Error deactivating item ${item.token}:`, error.message);
                        }
                    }
                }

                // 30% chance to set any for each category
                for (const category of ['play', 'teams', 'leagues']) {
                    if (Math.random() <= 0.3) {
                        try {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/sports'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: category,
                                    token: 'any',
                                    active: true
                                }
                            );
                        } catch (error) {
                            console.error(`Error setting any for ${category}:`, error.message);
                        }
                    }
                }

            } catch (error) {
                console.error(`Error processing sports for person ${person.person_token}:`, error.message);
            }
        });

    } catch (error) {
        console.error('Error in sports processing:', error);
    }

    console.log({
        sports: timeNow() - ts
    });
}

async function processMusic() {
    console.log({ filter: 'music' });
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
            try {
                // Process artists
                // Select 5-15 random artists
                const selectedArtists = shuffleFunc([...artists])
                    .slice(0, Math.floor(Math.random() * 11) + 5);

                for (const artist of selectedArtists) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/music'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'artists',
                                token: artist.token,
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error(`Error processing artist ${artist.token}:`, error.message);
                    }
                }

                // Process genres
                // Select 3-7 random genres
                const selectedGenres = shuffleFunc([...genres])
                    .slice(0, Math.floor(Math.random() * 5) + 3);

                for (const genre of selectedGenres) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/music'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'genres',
                                token: genre.token,
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error(`Error processing genre ${genre.token}:`, error.message);
                    }
                }

                // 20% chance to deactivate some selections randomly
                if (Math.random() <= 0.2) {
                    const itemsToDeactivate = [...selectedArtists, ...selectedGenres]
                        .filter(() => Math.random() > 0.7); // 30% chance to select each item

                    for (const item of itemsToDeactivate) {
                        try {
                            const isArtist = 'spotify_followers' in item;
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/music'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: isArtist ? 'artists' : 'genres',
                                    token: item.token,
                                    active: false
                                }
                            );
                        } catch (error) {
                            console.error(`Error deactivating item ${item.token}:`, error.message);
                        }
                    }
                }

                // 30% chance to set any for artists
                if (Math.random() <= 0.3) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/music'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'artists',
                                token: 'any',
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error('Error setting any artists:', error.message);
                    }
                }

                // 30% chance to set any for genres
                if (Math.random() <= 0.3) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/music'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'genres',
                                token: 'any',
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error('Error setting any genres:', error.message);
                    }
                }

            } catch (error) {
                console.error(`Error processing music for person ${person.person_token}:`, error.message);
            }
        });

    } catch (error) {
        console.error('Error in music processing:', error);
    }

    console.log({
        music: timeNow() - ts
    });
}

async function processInstruments() {
    console.log({ filter: 'instruments_filter' });
    let ts = timeNow();

    try {
        // Get all active instruments
        const instruments = await conn('instruments')
            .where('is_active', true)
            .orderBy('popularity', 'desc')
            .limit(50);

        // Get skill level options from sections data
        const skillLevels = sectionsData.instruments.secondary.instruments.options;

        await helpers.processBatch(async (person) => {
            try {
                const selectedInstruments = shuffleFunc([...instruments])
                    .slice(0, Math.floor(Math.random() * 2) + 1);

                for(let instrument of selectedInstruments) {
                    try {
                        // 40% chance to add secondary level
                        const addSecondary = Math.random() > 0.6;

                        let numSecondaries = Math.floor(Math.random() * 3) + 1;

                        let secondary = shuffleFunc(skillLevels)
                            .slice(0, numSecondaries);

                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/instruments'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'instruments',
                                token: instrument.token,
                                active: true
                            }
                        );

                        if(addSecondary) {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/instruments'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    table_key: 'instruments',
                                    token: instrument.token,
                                    secondary
                                }
                            );
                        }
                    } catch (error) {
                        console.error(`Error processing play sport ${sport.token}:`, error.message);
                    }
                }

                // 60% chance to set any instruments
                if (Math.random() <= 0.6) {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/instruments'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            token: 'any',
                            active: true
                        }
                    );
                }
            } catch (error) {
                console.error(`Error processing instruments for person ${person.person_token}:`, error.message);
            }
        });

    } catch (error) {
        console.error('Error in instruments processing:', error);
    }

    console.log({
        instruments: timeNow() - ts
    });
}

async function processSchools() {
    console.log({ me: 'schools' });
    let ts = timeNow();

    try {
        const test_country = await conn('open_countries')
            .where('country_code', 'US')
            .first();

        // Get schools for the test country ordered by student count
        const schools = await conn('schools')
            .where('country_id', test_country.id)
            .whereNull('deleted')
            .orderBy('student_count', 'desc')
            .select('id', 'token', 'is_grade_school', 'is_high_school', 'is_college')
            .limit(500);

        // Separate schools by type for balanced selection
        const collegeSchools = schools.filter(s => s.is_college);
        const highSchools = schools.filter(s => s.is_high_school);
        const gradeSchools = schools.filter(s => s.is_grade_school);

        await helpers.processBatch( async (person) => {
            // Randomly decide which types of schools to add
            const addCollege = Math.random() > 0.2; // 80% chance for college
            const addHighSchool = Math.random() > 0.3; // 70% chance for high school
            const addGradeSchool = Math.random() > 0.5; // 50% chance for grade school

            let schools = [];

            // Add 1-2 colleges if selected
            if (addCollege) {
                const selectedColleges = shuffleFunc(collegeSchools)
                    .slice(0, Math.floor(Math.random() * 2) + 1);

                schools = schools.concat(selectedColleges);

                for(let school of selectedColleges) {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/schools'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            token: school.token,
                            hash_token: test_country.country_code,
                            active: true
                        }
                    );
                }
            }

            // Add 1 high school if selected
            if (addHighSchool) {
                const school = shuffleFunc(highSchools)[0];

                schools.push(school);

                await axios.put(
                    joinPaths(process.env.APP_URL, '/filters/schools'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        token: school.token,
                        hash_token: test_country.country_code,
                        active: true
                    }
                );
            }

            // Add 1 grade school if selected
            if (addGradeSchool) {
                const school = shuffleFunc(gradeSchools)[0];

                schools.push(school);

                await axios.put(
                    joinPaths(process.env.APP_URL, '/filters/schools'),
                    {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        token: school.token,
                        hash_token: test_country.country_code,
                        active: true
                    }
                );
            }

            // 20% chance to deactivate some selections randomly
            if (Math.random() <= 0.2) {
                for(let school of schools) {
                    if (Math.random() > 0.7) { // 30% chance to deactivate each item
                        try {
                            await axios.put(
                                joinPaths(process.env.APP_URL, '/filters/schools'),
                                {
                                    login_token: person.login_token,
                                    person_token: person.person_token,
                                    hash_token: test_country.country_code,
                                    token: school.token,
                                    active: false
                                }
                            );
                        } catch (error) {
                            console.error(`Error deactivating school ${school.token}:`, error.message);
                        }
                    }
                }
            }

            // 30% chance to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/schools'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            hash_token: test_country.country_code,
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any school:', error.message);
                }
            }
        });

    } catch (error) {
        console.error('Error in processSchools:', error);
    }

    console.log({
        schools: timeNow() - ts
    });
}

async function processWork() {
    console.log({ filter: 'work_filter' });
    let ts = timeNow();

    try {
        // Get active industries and roles
        const industries = await conn('work_industries')
            .whereNull('deleted')
            .where('is_visible', true);

        const roles = await conn('work_roles')
            .whereNull('deleted')
            .where('is_visible', true);

        await helpers.processBatch(async (person) => {
            // Process Industries
            if (Math.random() > 0.4) { // 60% chance to add industries
                // Select 1-3 random industries
                const numIndustries = Math.floor(Math.random() * 3) + 1;
                const selectedIndustries = shuffleFunc([...industries]).slice(0, numIndustries);

                for (const industry of selectedIndustries) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/work'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'industries',
                                token: industry.token,
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error(`Error processing industry ${industry.token}:`, error.message);
                    }
                }
            }

            // Process Roles
            if (Math.random() > 0.4) { // 60% chance to add roles
                // Select 1-3 random roles
                const numRoles = Math.floor(Math.random() * 3) + 1;
                const selectedRoles = shuffleFunc([...roles]).slice(0, numRoles);

                for (const role of selectedRoles) {
                    try {
                        await axios.put(
                            joinPaths(process.env.APP_URL, '/filters/work'),
                            {
                                login_token: person.login_token,
                                person_token: person.person_token,
                                table_key: 'roles',
                                token: role.token,
                                active: true
                            }
                        );
                    } catch (error) {
                        console.error(`Error processing role ${role.token}:`, error.message);
                    }
                }
            }

            // 20% chance to set any for industries
            if (Math.random() <= 0.2) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/work'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'industries',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any industries:', error.message);
                }
            }

            // 20% chance to set any for roles
            if (Math.random() <= 0.2) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/work'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            table_key: 'roles',
                            token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any roles:', error.message);
                }
            }
        });

    } catch (error) {
        console.error('Error in work processing:', error);
    }

    console.log({
        work_filter: timeNow() - ts
    });
}

async function processLifeStages() {
    console.log({
        filter: 'life_stages_filter',
    });

    let ts = timeNow();

    let options = await meService.getLifeStages({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-5 random life stages

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 5) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/life-stages'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        life_stage_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting life stage filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/life-stages'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            life_stage_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any life stage:', error.message);
                }
            }
        }
    });

    console.log({
        life_stages_filter: timeNow() - ts,
    });
}

async function processRelationships() {
    console.log({
        filter: 'relationships',
    });

    let ts = timeNow();

    let options = await meService.getRelationshipStatus({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-3 random relationship statuses

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 3) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/relationship'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        relationship_status_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting relationship filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/relationship'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            relationship_status_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any relationship:', error.message);
                }
            }
        }
    });

    console.log({
        relationship: timeNow() - ts,
    });
}

async function processLanguages() {
    console.log({
        filter: 'languages',
    });

    let ts = timeNow();

    let options = await meService.getLanguages({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-4 random languages

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 4) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/languages'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        language_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting language filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/languages'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            language_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any language:', error.message);
                }
            }
        }
    });

    console.log({
        languages: timeNow() - ts,
    });
}

async function processPolitics() {
    console.log({
        filter: 'politics',
    });

    let ts = timeNow();

    let options = await meService.getPolitics({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-2 random politic options

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 5) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/politics'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        politics_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting politics filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/politics'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            politics_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any politics:', error.message);
                }
            }
        }
    });

    console.log({
        politics_filter: timeNow() - ts,
    });
}

async function processReligions() {
    console.log({
        filter: 'religions',
    });

    let ts = timeNow();

    let options = await meService.getReligions({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-3 random religions

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 3) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/religion'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        religion_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting religion filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/religion'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            religion_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any religion:', error.message);
                }
            }
        }
    });

    console.log({
        religions_filter: timeNow() - ts,
    });
}

async function processDrinking() {
    console.log({
        filter: 'drinking',
    });

    let ts = timeNow();

    let options = await meService.getDrinking({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-2 random drinking options

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 2) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/drinking'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        drinking_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting drinking filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/drinking'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            drinking_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any drinking:', error.message);
                }
            }
        }
    });

    console.log({
        drinking_filter: timeNow() - ts,
    });
}

async function processSmoking() {
    console.log({
        filter: 'smoking_filter',
    });

    let ts = timeNow();

    let options = await meService.getSmoking({ options_only: true });

    await helpers.processBatch(async (person) => {
        if (Math.random() > 0.3) { //70% chance to set
            //Select 1-2 random smoking options

            let personOptions = shuffleFunc(options)
                .slice(0, Math.floor(Math.random() * 2) + 1);

            for(let option of personOptions) {
                try {
                    await axios.put(joinPaths(process.env.APP_URL, '/filters/smoking'), {
                        login_token: person.login_token,
                        person_token: person.person_token,
                        smoking_token: option.token,
                        active: true,
                    });
                } catch (error) {
                    console.error('Error setting smoking filter:', error.message);
                }
            }

            //30% change to set any
            if (Math.random() <= 0.3) {
                try {
                    await axios.put(
                        joinPaths(process.env.APP_URL, '/filters/smoking'),
                        {
                            login_token: person.login_token,
                            person_token: person.person_token,
                            smoking_token: 'any',
                            active: true
                        }
                    );
                } catch (error) {
                    console.error('Error setting any smoking:', error.message);
                }
            }
        }
    });

    console.log({
        smoking_filter: timeNow() - ts,
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

await processDrinking();
await processSmoking();
return;

    // notifications
    await processAvailability();
    await processActivityTypes();
    await processModes();
    await processNetworks();
    await processReviews();
    await processVerifications();

    //general
    await processDistance();
    await processAge();
    await processGender();

    //interests
    await processMovies();
    await processTvShows();
    await processSports();
    await processMusic();
    await processInstruments();

    //schools & work
    await processSchools();
    await processWork();

    //personal
    await processLifeStages();
    await processRelationships();
    await processLanguages();
    await processPolitics();
    await processReligions();
    await processDrinking();
    await processSmoking();

    //settings
    await processActive();
    await processSendReceive();
    await processImportance();

    process.exit();
})();
