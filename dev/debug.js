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

            // 'genders',
            // 'distance',
            // 'ages',

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
        me: isProdApp() ? false : false,
        filters: isProdApp() ? false : true
    }
};