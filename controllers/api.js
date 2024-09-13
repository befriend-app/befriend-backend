const dbService = require('../services/db');

module.exports = {
    getNetworks: function (req, res) {
        return new Promise(async (resolve, reject) => {
            try {
                 let conn = await dbService.conn();

                 let networks = await conn('networks')
                     .select('network_token', 'network_name', 'network_logo', 'base_domain', 'api_domain', 'priority',
                        'is_befriend', 'is_trusted', 'is_online', 'last_online', 'created', 'updated'
                     );

                 res.json({
                     networks: networks
                 });
            } catch(e) {
                res.json("Error getting networks", 400);
            }
        });
    }
}