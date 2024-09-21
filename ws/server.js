const {loadScriptEnv, isProdApp, generateToken, timeNow, getDateTimeStr, getSessionKey} = require('../services/shared');

loadScriptEnv();

const cacheService = require('../services/cache');
const dbService = require('../services/db');

const _ = require('lodash');
const fs = require('fs');
const http = require('http');
const https = require('https');
const process = require('process');
const query_string = require('query-string');

const WebSocket = require('ws');

const port_num = process.env.WS_PORT || 8080;

const message_timeout = 3600; //seconds

let conn;

let persons_connections = {};

let persons_messages = {};

//setup server
let server;

let options = {};

if(process.env.APP_ENV !== 'local') {
    if(isProdApp()) {
        options = {
            cert: fs.readFileSync('/etc/ssl/certs/befriend.crt'),
            key: fs.readFileSync('/etc/ssl/private/befriend.key')
        };
    } else {
        options = {
            cert: fs.readFileSync('/etc/ssl/certs/dev.befriend.crt'),
            key: fs.readFileSync('/etc/ssl/private/dev.befriend.key')
        };
    }

    server = https.createServer(options);
} else {
    server = http.createServer(options);
}


const wss = new WebSocket.Server({ server: server });


process.on('uncaughtException', function (err) {
    if(err.code === 'EADDRINUSE') {
        let exec = require('child_process').exec;

        exec(`sudo lsof -i :${port_num}`, function callback(error, stdout, stderr){
            let lines = stdout.split('\n');

            let pid;

            lines.forEach(function (line) {
                if(line.indexOf('node') > -1) {
                    pid = line.split(/[ ]+/)[1];
                    return false;
                }
            });

            exec(`sudo kill -9 ${pid}`, function (error, stdout) {
                server.listen(port_num);
            });
        });
    }
});


function initDB() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Init DB");

            conn = await dbService.conn();
            resolve();
        } catch(e) {
            return reject(e);
        }
    });
}

function initRedis() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Init Redis");

            await cacheService.init();

            resolve();
        } catch(e) {
            return reject(e);
        }
    });
}

function removeConnections(ws) {
    removePersonConnection(ws);
}

function removePersonConnection(ws) {
    let user_connections = persons_connections[ws.person_token];

    if(user_connections && user_connections.length) {
        user_connections.splice(user_connections.indexOf(ws), 1);
    }
}

function terminate(ws, logout) {
    console.log({
        logout: ws
    });

    if(logout) {
        ws.send(401);
    }

    ws.terminate();

    removeConnections(ws);
}

function getSession(url) {
    return new Promise(async (resolve, reject) => {
        if(url.length > 1000) {
            return reject("URL too long");
        }

        const parsed = query_string.parse(url.replace('/', ''));

        try {
            let data = await cacheService.get(getSessionKey(parsed.session), true);

            return resolve(data);
        } catch (e) {
            return reject(e);
        }
    });
}

function sendRecentMessages(ws) {
    //send messages
    if(ws.person_token && ws.person_token in persons_messages) {
        let messages = persons_messages[ws.person_token];

        if(ws.readyState === WebSocket.OPEN) {
            for(let k in messages) {
                let message = messages[k];

                ws.send(JSON.stringify(message));
                delete messages[k];
            }
        }
    }
}

function initWS() {
    return new Promise((resolve, reject) => {
        console.log("Init WS");

        function heartBeat() {
            this.isAlive = true;
        }

        wss.on('connection', async function connection(ws, req) {
            let session_data = null;

            try {
                session_data = await getSession(req.url);
            } catch (e) {
                return terminate(ws, true);
            }

            let session_id = session_data.key;
            let person_token = session_data.person_token ? session_data.person_token : null;

            console.log("Connection", {
                session_id: session_id,
                person_token: person_token
            });

            ws.isAlive = true;
            ws.person_token = person_token;
            ws.session_id = session_id;

            if(!(person_token in persons_connections)) {
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
                if(!ws.session_id) {
                    return false;
                }

                if(ws.isAlive === false) {
                    return terminate(ws);
                }

                ws.isAlive = false;

                ws.ping(function () {
                    return {};
                });
            });
        }, 5000);

        server.listen(port_num);

        resolve();
    });
}

function addPersonMessage(data) {
    if(!data) {
        return;
    }

    let person_token = data.person_token;

    if(!(person_token in persons_messages)) {
        persons_messages[person_token] = {};
    }

    let token = generateToken(20);

    data.timestamp = timeNow();

    if(person_token) {
        persons_messages[person_token][token] = data;
    }
}

function initSubscribe() {
    return new Promise(async (resolve, reject) => {
        console.log("Init subscribe");

        const subscriber = cacheService.conn;

        subscriber.on("message", (channel, message) => {
            if (channel === cacheService.keys.ws) {
                try {
                    let data = JSON.parse(message.toString());

                    //skip sending messages without a process key
                    if(data && !data.process_key && data.data) {
                        return;
                    }

                    console.log("processing ws message", getDateTimeStr());

                    let message_sent = false;
                    let person_token = data.person_token;

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
                } catch (e) {
                    console.error(e);
                }
            }
        });

        subscriber.subscribe(cacheService.keys.ws);

        resolve();
    });

}

function deleteOldMessages() {
    //remove old messages in memory

    setInterval(function () {
        let time_now = timeNow(true);

        for(let person_token in persons_messages) {
            let person_messages = persons_messages[person_token];

            for(let token in person_messages) {
                let message = person_messages[token];

                //compare
                if(time_now - message.timestamp > message_timeout) {
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