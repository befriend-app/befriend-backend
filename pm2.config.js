let home_dir = __dirname;

module.exports = {
    apps: [
        {
            name: 'befriend_backend',
            script: 'server.js',
            instances: '1',
            exec_mode: 'fork',
            // instances: '2',
            // exec_mode: 'cluster',
            cwd: home_dir,
            node_args: '-r dotenv/config',
        },
    ],
};
