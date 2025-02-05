const { isProdApp } = require('../services/shared');

module.exports = {
    activities: {
        create: isProdApp() ? false : true
    },
    matching: {
        on: isProdApp() ? false : true,
        logs: isProdApp() ? false : true,
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

            'distance',
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
            if(!module.exports.matching.on) {
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
        notify_matches: isProdApp() ? false : true,
        networks: isProdApp() ? false : true,
    }
};