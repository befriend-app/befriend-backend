let cacheService = require('./cache');
let dbService = require('./db');

const MAX_PREFIX_LIMIT = 3;
const TOP_GENRE_ARTISTS_COUNT = 100;

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topGenreArtistsCount: TOP_GENRE_ARTISTS_COUNT,
};