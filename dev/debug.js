const { isProdApp } = require('../services/shared');

module.exports = {
    activities: {
        create: isProdApp() ? false : true,
        accept: isProdApp() ? false : true
    },
    matching: {
        logs: isProdApp() ? false : true,
        get_matches: isProdApp() ? false : true,
        filter_matches: isProdApp() ? false : true,
        filters: [
            //notifications

            // 'online',
            // 'availability',
            // 'activity_types',
            // 'modes',
            // 'networks',
            // 'reviews',
            // 'verifications',

            //general

            // 'distance',
            // 'ages',
            // 'genders',

            //personal
            // 'life_stages',
            // 'relationships',
            // 'languages',
            // 'politics',
            // 'religion',
            // 'drinking',
            // 'smoking',

            //interests

        ],
        skipDebugFilter: function(filter) {
            if(!module.exports.matching.get_matches) {
                return false;
            }

            return !(module.exports.matching.filters.includes(filter));
        }
    },
    sync: {
        networks_persons: isProdApp() ? false : true,
        persons: isProdApp() ? false : true,
        me: isProdApp() ? false : true,
        filters: isProdApp() ? false : true
    },
    notifications: {
        networks: isProdApp() ? false : true,
    }
};