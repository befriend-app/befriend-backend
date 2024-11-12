const http2 = require('http2');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { joinPaths, getRepoRoot, timeNow } = require('./shared');

let provider = null;

const createAPNSConnection = async (baseURL) => {
    const connect = () => {
        return new Promise((resolve, reject) => {
            const client = http2.connect(baseURL);

            client.once('connect', () => resolve(client));
            client.once('error', reject);

            // Remove error listener after successful connection
            client.once('connect', () => client.removeListener('error', reject));
        });
    };

    let client = await connect();

    const reconnect = async () => {
        if (client) {
            client.close();
        }
        try {
            client = await connect();

            client.on('error', async (err) => {
                console.error('HTTP/2 client error:', err);
                client = await reconnect();
            });

            client.on('goaway', async () => {
                client = await reconnect();
            });
        } catch (error) {
            console.error('Reconnection failed:', error);
            // Exponential backoff could be implemented here
            throw error;
        }
        return client;
    };

    client.on('error', async (err) => {
        console.error('HTTP/2 client error:', err);
        client = await reconnect();
    });

    client.on('goaway', async () => {
        client = await reconnect();
    });

    // Check connection health periodically
    setInterval(
        async () => {
            if (!client?.socket?.connecting) {
                try {
                    client = await reconnect();
                } catch (error) {
                    console.error('Health check reconnection failed:', error);
                }
            }
        },
        30 * 60 * 1000,
    );

    return {
        getClient: () => client,
        close: () => client && client.close(),
        reconnect,
    };
};

function createTokenManager(keyId, teamId, privateKey) {
    const state = {
        currentToken: null,
        tokenExpiry: null,
    };

    function generateNewToken() {
        const header = {
            alg: 'ES256',
            kid: keyId,
        };

        const claims = {
            iss: teamId,
        };

        state.currentToken = jwt.sign(claims, privateKey, {
            algorithm: 'ES256',
            header: header,
            expiresIn: '1h',
        });

        state.tokenExpiry = Date.now() + 55 * 60 * 1000;
    }

    function getToken() {
        try {
            const now = Date.now();

            if (state.currentToken && state.tokenExpiry && now < state.tokenExpiry) {
                return state.currentToken;
            }

            generateNewToken();

            return state.currentToken;
        } catch (error) {
            throw new Error(`Token generation failed: ${error.message}`);
        }
    }

    return {
        getToken,
    };
}

function createAPNSProvider(options) {
    return new Promise(async (resolve, reject) => {
        try {
            const privateKey = await fs.promises.readFile(options.token.key);
            const baseURL = options.production
                ? 'https://api.push.apple.com'
                : 'https://api.development.push.apple.com';

            const connection = await createAPNSConnection(baseURL);
            const tokenManager = createTokenManager(
                options.token.keyId,
                options.token.teamId,
                privateKey,
            );

            const getErrorReason = (status) => {
                const errorReasons = {
                    400: 'Bad request',
                    403: 'Invalid certificate or token',
                    404: 'Invalid device token',
                    410: 'Device token is no longer active',
                    413: 'Notification payload too large',
                    429: 'Too many requests',
                    500: 'Internal server error',
                    503: 'Service unavailable',
                };
                return errorReasons[status] || 'Unknown error';
            };

            const send = async (notification, deviceToken) => {
                try {
                    const token = tokenManager.getToken();
                    const headers = {
                        ':method': 'POST',
                        ':scheme': 'https',
                        ':path': `/3/device/${deviceToken}`,
                        authorization: `bearer ${token}`,
                        'apns-topic': notification.topic,
                        'apns-expiration': notification.expiry.toString(),
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    };

                    const payload = {
                        aps: {
                            alert: notification.alert,
                            badge: notification.badge,
                            sound: notification.sound,
                            'interruption-level': notification['interruption-level'],
                        },
                        ...notification.payload,
                    };

                    return new Promise((resolve, reject) => {
                        const client = connection.getClient();

                        if (!client) {
                            reject(new Error('No active HTTP/2 connection'));
                            return;
                        }

                        const req = client.request(headers);
                        let responseData = '';

                        req.on('response', (headers) => {
                            const status = headers[':status'];
                            if (status === 200) {
                                resolve({
                                    sent: [
                                        {
                                            device: deviceToken,
                                            status: 'success',
                                        },
                                    ],
                                    failed: [],
                                });
                            } else {
                                reject({
                                    sent: [],
                                    failed: [
                                        {
                                            device: deviceToken,
                                            status: 'error',
                                            response: {
                                                reason: getErrorReason(status),
                                                statusCode: status,
                                                error: responseData,
                                            },
                                        },
                                    ],
                                });
                            }
                        });

                        req.on('data', (chunk) => {
                            responseData += chunk;
                        });

                        req.on('error', (err) => {
                            reject({
                                sent: [],
                                failed: [
                                    {
                                        device: deviceToken,
                                        status: 'error',
                                        response: {
                                            reason: 'Request failed',
                                            error: err.message,
                                        },
                                    },
                                ],
                            });
                        });

                        req.write(JSON.stringify(payload));
                        req.end();
                    });
                } catch (error) {
                    throw {
                        sent: [],
                        failed: [
                            {
                                device: deviceToken,
                                status: 'error',
                                response: {
                                    reason: 'Internal error',
                                    error: error.message,
                                },
                            },
                        ],
                    };
                }
            };

            resolve({
                send,
                close: connection.close,
                reconnect: connection.reconnect,
            });
        } catch (error) {
            console.error(error);
            return reject(error);
        }
    });
}

function getAPNSProvider(options) {
    return new Promise(async (resolve, reject) => {
        if (!provider) {
            try {
                provider = await createAPNSProvider(options);
            } catch (e) {
                console.error(e);
                return reject();
            }
        }

        resolve(provider);
    });
}

function sendIOSBatch(deviceTokens, payload, time_sensitive) {
    return new Promise(async (resolve, reject) => {
        const options = {
            token: {
                key: process.env.APPLE_PRIVATE_KEY,
                keyId: process.env.APPLE_KEY_ID,
                teamId: process.env.APPLE_TEAM_ID,
            },
            production: false,
        };

        try {
            let t = timeNow();
            const apnProvider = await getAPNSProvider(options);

            console.log({
                apnProvider: timeNow() - t,
            });

            let notifyData = {
                topic: process.env.APPLE_APP_ID,
                expiry: Math.floor(Date.now() / 1000) + 3600,
                sound: 'ping.aiff',
                alert: {
                    title: payload.title,
                    body: payload.body,
                },
                payload: payload.data || {},
            };

            if (time_sensitive) {
                notifyData['interruption-level'] = 'time-sensitive';
            }

            let results = await Promise.allSettled(
                deviceTokens.map((token) => apnProvider.send(notifyData, token)),
            );

            // Process results to handle both fulfilled and rejected promises
            results = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }
                return {
                    sent: [],
                    failed: [
                        {
                            device: deviceTokens[index],
                            status: 'error',
                            response: {
                                reason: 'Send failed',
                                error: result.reason.message || 'Unknown error',
                            },
                        },
                    ],
                };
            });

            resolve(results);
        } catch (error) {
            console.error(error);
            return reject();
        }
    });
}

module.exports = {
    ios: {
        sendBatch: sendIOSBatch,
    },
};
