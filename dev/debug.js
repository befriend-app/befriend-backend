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
            // 'networks',
            // 'reviews',
            // 'verifications',

            //general

            // 'distance',
            // 'ages',
            'genders',

            //personal

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
        persons: isProdApp() ? false : false,
        me: isProdApp() ? false : false,
        filters: isProdApp() ? false : false
    }
};