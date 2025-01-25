module.exports = {
    matching: {
        on: true,
        filters: [
            // 'online',
            // 'networks',
            // 'modes',
            // 'verifications',
            // 'genders',
            // 'distance',
            // 'ages',
            // 'reviews',
            // 'availability',
        ],
        skipDebugFilter: function(filter) {
            if(!module.exports.matching.on) {
                return false;
            }

            return !(module.exports.matching.filters.includes(filter));
        }
    },
    sync: {
        me: false,
        filters: true
    }
};