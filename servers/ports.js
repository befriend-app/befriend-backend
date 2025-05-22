const { loadScriptEnv, normalizePort } = require('../services/shared');

loadScriptEnv();

module.exports = {
    api: normalizePort(process.env.MAIN_SERVER_PORT || '3000'),
    grid: normalizePort(process.env.GRID_PORT || '3001'),
    matching: normalizePort(process.env.MATCHING_PORT || '3002'),
    ws: normalizePort(process.env.WS_PORT || '8080'),
}