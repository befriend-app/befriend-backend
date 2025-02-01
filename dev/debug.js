const { isProdApp } = require('../services/shared');

module.exports = {
    matching: {
        on: isProdApp() ? false : true,
        filters: [
            //notifications

            // 'online',
            // 'availability',
            // 'activity_types',
            // 'modes',
            'networks',
            // 'reviews',
            // 'verifications',

            //general

            // 'distance',
            // 'ages',
            // 'genders',

            //personal
            // 'life_stages',
            // 'relationships'
            // 'languages',
            // 'politics',
            // 'religion',
            // 'drinking',
            // 'smoking',

            //interests

        ],
        skipDebugFilter: function(filter) {
            if(!module.exports.matching.on) {
                return false;
            }

            return !(module.exports.matching.filters.includes(filter));
        }
    },
    sync: {
        networks_persons: isProdApp() ? false : true,
        persons: isProdApp() ? false : false,
        me: isProdApp() ? false : false,
        filters: isProdApp() ? false : false
    }
};