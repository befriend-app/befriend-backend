let cacheService = require('./cache');
const { getObj } = require('./cache');
const { normalizeSearch, timeNow } = require('./shared');
const { getCitiesByCountry, getStates } = require('./locations');
const sectionsData = require('./sections_data');

const MAX_PREFIX_LIMIT = 3;
const RESULTS_LIMIT = 50;
const TOP_GENRE_ARTISTS_COUNT = 100;

function getTopArtistsForGenre(genre_token) {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.music_genre_top_artists(genre_token);

        try {
            let data = await getObj(cache_key);

            if (!data) {
                return reject('No items found');
            }

            let pipeline = cacheService.startPipeline();

            for (let item of data) {
                pipeline = pipeline.hGet(cacheService.keys.music_artists, item.artist_token);
            }

            let items = await pipeline.execAsPipeline();

            for (let i = 0; i < items.length; i++) {
                items[i] = JSON.parse(items[i]);
            }

            resolve(items);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

function musicAutoComplete(search_term, category, user_location) {
    return new Promise(async (resolve, reject) => {
        let minLength = sectionsData.music.autoComplete.minChars;
        let maxLength = MAX_PREFIX_LIMIT;

        search_term = normalizeSearch(search_term);

        if (search_term.length < minLength) {
            return resolve([]);
        }

        let prefix = search_term.substring(0, maxLength);
        let artistResults = [];
        let genreArtists = [];
        let remainingArtists = [];

        try {
            // Always get prefix-matching artists first
            const prefix_key = cacheService.keys.music_artists_prefix(prefix);
            const artist_tokens = await cacheService.getSetMembers(prefix_key);

            if (artist_tokens?.length) {
                let pipeline = cacheService.startPipeline();

                for (let token of artist_tokens) {
                    pipeline.hGet(cacheService.keys.music_artists, token);
                }

                let artists = await cacheService.execMulti(pipeline);

                // Break search term into words
                const searchWords = search_term.toLowerCase().split(/\s+/);

                for (let artist of artists) {
                    if (artist) {
                        try {
                            artist = JSON.parse(artist);

                            if (artist?.name) {
                                const artistName = artist.name.toLowerCase();
                                const artistWords = artistName.split(/\s+/);

                                // Different matching categories
                                const exactMatch = artistName === search_term;
                                const containsFullPhrase = artistName.includes(search_term);
                                const matchesAllWords = searchWords.every((searchWord) =>
                                    artistWords.some((artistWord) =>
                                        artistWord.includes(searchWord),
                                    ),
                                );

                                if (exactMatch || containsFullPhrase || matchesAllWords) {
                                    artistResults.push(artist);
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing artist data:', e);
                        }
                    }
                }

                artistResults.sort((a, b) => b.followers - a.followers);
            }

            // For genre categories, prepend genre-specific artists
            if (category.token) {
                for (let artist of artistResults) {
                    if (artist.genres && category.token in artist.genres) {
                        genreArtists.push(artist);
                    } else {
                        remainingArtists.push(artist);
                    }
                }

                //combine with artists
                artistResults = genreArtists.concat(remainingArtists);
            }

            // Limit final results
            artistResults = artistResults.slice(0, RESULTS_LIMIT);

            resolve(artistResults);
        } catch (e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topGenreArtistsCount: TOP_GENRE_ARTISTS_COUNT,
    getTopArtistsForGenre,
    musicAutoComplete,
};
