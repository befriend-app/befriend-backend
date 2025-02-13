const slugify = require('slugify');
const { loadScriptEnv } = require('./services/shared');
loadScriptEnv();

let home_dir = __dirname;

let app_name = slugify(process.env.NETWORK_NAME || 'befriend');

module.exports = {
    apps: [
        {
            name: `${app_name}_api_server`,
            script: 'servers/api.js',
            instances: '1',
            exec_mode: 'fork',
            // instances: '2',
            // exec_mode: 'cluster',
            cwd: home_dir,
            node_args: '-r dotenv/config'
        },
        {
            name: `${app_name}_ws_server`,
            script: 'servers/ws.js',
            instances: '1',
            exec_mode: 'fork',
            cwd: home_dir,
            node_args: '-r dotenv/config'
        },
        {
            name: `${app_name}_grid_server`,
            script: 'servers/grid.js',
            instances: '1',
            exec_mode: 'fork',
            cwd: home_dir,
            node_args: '-r dotenv/config'
        },
    ],
};
