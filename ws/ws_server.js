const {
    loadScriptEnv,
    isProdApp,
    generateToken,
    timeNow,
    getDateTimeStr,
} = require('../services/shared');

loadScriptEnv();

const cacheService = require('../services/cache');
const dbService = require('../services/db');
const personsService = require('../services/persons');

const _ = require('lodash');
const fs = require('fs');
const http = require('http');
const https = require('https');
const process = require('process');
const query_string = require('query-string');

const WebSocket = require('ws');

const port_num = process.env.WS_PORT || 8080;
const ws_channel_key = cacheService.keys.ws;

const message_timeout = 3600; //seconds

let conn;

let persons_connections = {};

let persons_messages = {};

//setup server
let ws_server;

let options = {};

if (process.env.APP_ENV !== 'local') {
    if (isProdApp()) {
        options = {
            cert: fs.readFileSync('/etc/ssl/certs/befriend.crt'),
            key: fs.readFileSync('/etc/ssl/private/befriend.key'),
        };
    } else {
        options = {
            cert: fs.readFileSync('/etc/ssl/certs/dev.befriend.crt'),
            key: fs.readFileSync('/etc/ssl/private/dev.befriend.key'),
        };
    }

    ws_server = https.createServer(options);
} else {
    ws_server = http.createServer(options);
}

const wss = new WebSocket.Server({ server: ws_server });

process.on('uncaughtException', function (err) {
    if (err.code === 'EADDRINUSE') {
        let exec = require('child_process').exec;

        exec(`sudo lsof -i :${port_num}`, function callback(error, stdout, stderr) {
            let lines = stdout.split('\n');

            let pid;

            lines.forEach(function (line) {
                if (line.indexOf('node') > -1) {
                    pid = line.split(/[ ]+/)[1];
                    return false;
                }
            });

            exec(`sudo kill -9 ${pid}`, function (error, stdout) {
                ws_server.listen(port_num);
            });
        });
    }
});

function initDB() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Init DB');

            conn = await dbService.conn();
            resolve();
        } catch (e) {
            return reject(e);
        }
    });
}

function initRedis() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Init Redis');

            await cacheService.init();

            resolve();
        } catch (e) {
            return reject(e);
        }
    });
}

function removeConnections(ws) {
    removePersonConnection(ws);
}

function removePersonConnection(ws) {
    let user_connections = persons_connections[ws.person_token];

    if (user_connections && user_connections.length) {
        user_connections.splice(user_connections.indexOf(ws), 1);
    }
}

function terminate(ws, logout) {
    console.log({
        logout: ws,
    });

    if (logout) {
        ws.send(401);
    }

    ws.terminate();

    removeConnections(ws);
}

function parseUrlParams(url) {
    return query_string.parse(url.replace('/', ''));
}

function sendRecentMessages(ws) {
    //send messages
    if (ws.person_token && ws.person_token in persons_messages) {
        let messages = persons_messages[ws.person_token];

        if (ws.readyState === WebSocket.OPEN) {
            for (let k in messages) {
                let message = messages[k];

                ws.send(JSON.stringify(message));
                delete messages[k];
            }
        }
    }
}

function initWS() {
    return new Promise((resolve, reject) => {
        console.log('Init WS');

        function heartBeat() {
            this.isAlive = true;
        }

        wss.on('connection', async function connection(ws, req) {
            //prevent long url strings
            if (req.url.length > 1000) {
                return terminate(ws, true);
            }

            let params = parseUrlParams(req.url);

            if(!params.person_token || !params.login_token) {
                return terminate(ws, true);
            }

            let person_token = params.person_token;
            let login_token = params.login_token;

            try {
                let is_authenticated = await personsService.isAuthenticated(person_token, login_token);

                if(!is_authenticated) {
                    return terminate(ws, true);
                }
            } catch (e) {
                return terminate(ws, true);
            }

            console.log('Connection', {
                person_token: person_token,
            });

            ws.isAlive = true;
            ws.person_token =person_token;

            if (!(person_token in persons_connections)) {
                persons_connections[person_token] = [];
            }

            persons_connections[person_token].push(ws);

            //do not allow incoming messages
            ws.on('message', function incoming(message) {
                terminate(ws, true);
            });

            ws.on('pong', heartBeat);

            ws.on('close', function () {
                removeConnections(ws);
            });

            sendRecentMessages(ws);
        });

        const heart_interval = setInterval(function () {
            wss.clients.forEach(function each(ws) {
                if (!ws.session_id) {
                    return false;
                }

                if (ws.isAlive === false) {
                    return terminate(ws);
                }

                ws.isAlive = false;

                ws.ping(function () {
                    return {};
                });
            });
        }, 5000);

        ws_server.listen(port_num);

        resolve();
    });
}

function addPersonMessage(data) {
    if (!data) {
        return;
    }

    let person_token = data.person_token;

    if (!(person_token in persons_messages)) {
        persons_messages[person_token] = {};
    }

    let token = generateToken(20);

    data.timestamp = timeNow();

    if (person_token) {
        persons_messages[person_token][token] = data;
    }
}

function initSubscribe() {
    return new Promise(async (resolve, reject) => {
        console.log('Init Subscribe');

        const publisher = cacheService.publisher;

        publisher.subscribe(ws_channel_key, (message) => {
            try {
                let data = JSON.parse(message.toString());

                //skip sending messages without a process key
                // if(data && !data.process_key) {
                //     return;
                // }

                console.log("processing ws message", getDateTimeStr());

                if(data.matches && data.matches.length) {
                    for(let match of data.matches) {
                        let message_sent = false;

                        let person_token = match.person_token;

                        if(person_token in persons_connections) {
                            for(let k in persons_connections[person_token]) {
                                let client = persons_connections[person_token][k];

                                if(client.readyState === WebSocket.OPEN) {
                                    console.log("Message sent");

                                    client.send(JSON.stringify(data));
                                    message_sent = true;
                                }
                            }
                        }

                        if(!message_sent) {
                            addPersonMessage(data);
                        }
                    }
                }
            } catch (e) {
                console.error(e);
            }
        });

        resolve();
    });
}

function deleteOldMessages() {
    //remove old messages in memory

    setInterval(function () {
        let time_now = timeNow(true);

        for (let person_token in persons_messages) {
            let person_messages = persons_messages[person_token];

            for (let token in person_messages) {
                let message = person_messages[token];

                //compare
                if (time_now - message.timestamp > message_timeout) {
                    delete person_messages[token];
                }
            }
        }
    }, 60 * 1000);
}

async function init() {
    await initDB();
    await initRedis();
    await initWS();
    await initSubscribe();
    deleteOldMessages();
}

init();