const axios = require('axios');
const { loadScriptEnv, timeNow, generateToken } = require('../../services/shared');
const dbService = require('../../services/db');

loadScriptEnv();

const RESULTS_PER_PAGE = 20;
const MAX_PAGES = 500;
const MOVIES_PER_YEAR = RESULTS_PER_PAGE * MAX_PAGES;

function fetchMoviesForDateRange(startDate, endDate) {
    return new Promise(async (resolve, reject) => {
        const options = {
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
            },
        };

        let conn = await dbService.conn();

        let current_page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            const url = `https://api.themoviedb.org/3/discover/movie?include_adult=false&include_video=false&language=en-US&page=${current_page}&sort_by=popularity.desc&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}`;

            try {
                const response = await axios.get(url, options);
                const { results, total_pages } = response.data;

                // Process and save movies
                let batch_insert = [];

                for (const movie of results) {
                    if (!movie.release_date) {
                        continue;
                    }

                    batch_insert.push({
                        tmdb_id: movie.id,
                        tmdb_poster_path: movie.poster_path,
                        token: generateToken(10),
                        name: movie.title,
                        original_language: movie.original_language,
                        release_date: movie.release_date,
                        popularity: movie.popularity,
                        type: 'movie',
                        created: timeNow(),
                        updated: timeNow(),
                    });
                }

                await dbService.batchUpdate('movies', batch_insert);

                console.log(
                    `Processed page ${current_page}/${total_pages} for date range ${startDate} to ${endDate}`,
                );

                current_page++;
                hasMorePages = current_page <= Math.min(total_pages, MAX_PAGES);
            } catch (e) {
                console.error(
                    `Error fetching page ${current_page} for dates ${startDate}-${endDate}:`,
                    e.message,
                );
                // Add delay before retry
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        resolve();
    });
}

function getMonthRanges(year) {
    const months = [
        { month: 1, days: 31 },
        { month: 2, days: isLeapYear(year) ? 29 : 28 },
        { month: 3, days: 31 },
        { month: 4, days: 30 },
        { month: 5, days: 31 },
        { month: 6, days: 30 },
        { month: 7, days: 31 },
        { month: 8, days: 31 },
        { month: 9, days: 30 },
        { month: 10, days: 31 },
        { month: 11, days: 30 },
        { month: 12, days: 31 },
    ];

    return months.map(({ month, days }) => ({
        start: `${year}-${String(month).padStart(2, '0')}-01`,
        end: `${year}-${String(month).padStart(2, '0')}-${days}`,
    }));
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function main() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Add movies');

            // Start from 1900 to current year
            let startYear = 1900;
            const currentYear = new Date().getFullYear();

            for (let year = startYear; year <= currentYear; year++) {
                console.log(`Processing year ${year}`);

                const shouldBreakIntoMonths = true;

                if (shouldBreakIntoMonths) {
                    const months = getMonthRanges(year);

                    for (const month of months) {
                        await fetchMoviesForDateRange(month.start, month.end);
                        // Add delay between months to avoid rate limiting
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                } else {
                    await fetchMoviesForDateRange(`${year}-01-01`, `${year}-12-31`);
                }

                // Add delay between years to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            resolve();
        } catch (e) {
            console.error(e);
        }

        resolve();
    });
}

module.exports = {
    main: main,
};

if (require.main === module) {
    (async function () {
        try {
            await main();
            process.exit();
        } catch (e) {
            console.error(e);
        }
    })();
}
