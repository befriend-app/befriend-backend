#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');

const servers = ['api.js', 'ws.js', 'grid.js'];

function spawnServer(scriptName) {
    const scriptPath = path.join(__dirname, scriptName);

    const process = spawn('node', [scriptPath], {
        stdio: ['inherit', 'pipe', 'pipe'],
    });

    const prefix = `[${scriptName}] `;

    process.stdout.on('data', (data) => {
        console.log(prefix + data.toString().trim());
    });

    process.stderr.on('data', (data) => {
        console.error(prefix + data.toString().trim());
    });

    process.on('error', (error) => {
        console.error(`${prefix}Failed to start: ${error.message}`);
    });

    process.on('close', (code) => {
        if (code !== 0) {
            console.error(`${prefix}Process exited with code ${code}`);
        }
    });

    return process;
}

function startServers() {
    const processes = servers.map((server) => {
        console.log(`Starting ${server}...`);
        return spawnServer(server);
    });

    process.on('SIGINT', () => {
        processes.forEach((proc) => {
            proc.kill('SIGINT');
        });

        process.exit(0);
    });
}

startServers();
