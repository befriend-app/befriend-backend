let cacheService = require('./cache');
let dbService = require('./db');
const { getObj } = require('./cache');

const MAX_PREFIX_LIMIT = 3;
const TOP_GENRE_ARTISTS_COUNT = 100;

function getTopArtistsForGenre(genre_token) {
    return new Promise(async (resolve, reject) => {
        let cache_key = cacheService.keys.music_genre_top_artists(genre_token);

        try {
             let data = await getObj(cache_key);

             if(!data) {
                 return reject("No items found");
             }

             let pipeline = cacheService.conn.multi();

             for(let item of data) {
                 pipeline = pipeline.hGet(cacheService.keys.music_artists, item.artist_token);
             }

             let items = await pipeline.execAsPipeline();

             for(let i = 0; i < items.length; i++) {
                 items[i] = JSON.parse(items[i]);
             }

             resolve(items);
        } catch(e) {
            console.error(e);
            return reject(e);
        }
    });
}

module.exports = {
    prefixLimit: MAX_PREFIX_LIMIT,
    topGenreArtistsCount: TOP_GENRE_ARTISTS_COUNT,
    getTopArtistsForGenre

};