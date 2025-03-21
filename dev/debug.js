const { isProdApp } = require('../services/shared');

module.exports = {
    process: {
        activity_fulfilled: isProdApp() ? false : true,
    },
    activities: {
        cancel: isProdApp() ? false : false,
        create: isProdApp() ? false : true,
        accept: isProdApp() ? false : true,
        checkIn: isProdApp() ? false : true,
    },
    matching: {
        logs: isProdApp() ? false : true,
        get_matches: isProdApp() ? false : false,
        filter_matches: isProdApp() ? false : true,
        send_count: 3,
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
            'politics',
            // 'religion',
            // 'drinking',
            // 'smoking',
            //interests
        ],
        skipDebugFilter: function (filter) {
            if (!module.exports.matching.get_matches) {
                return false;
            }

            return !module.exports.matching.filters.includes(filter);
        },
    },
    sync: {
        activities: isProdApp() ? false : true,
        networks_persons: isProdApp() ? false : false,
        persons: isProdApp() ? false : false,
        me: isProdApp() ? false : false,
        filters: isProdApp() ? false : false,
    },
    notifications: {
        networks: isProdApp() ? false : true,
        recent: isProdApp() ? false : true,
    },
    reviews: {
        reviewable: isProdApp() ? false : false,
    },
};
