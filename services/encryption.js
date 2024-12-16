const { Worker, isMainThread, parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const os = require('os');
const dbService = require('./db');
const networkService = require('./network');

// Worker thread code
if (!isMainThread) {
    parentPort.on('message', async ({ type, password, hash, rounds, key, message, encrypted_message }) => {
        try {
            let result;
            let processedKey;
            let iv;
            let cipher;
            let decipher;
            let encrypted;
            let ivHex;
            let decrypted;

            switch (type) {
                case 'compare':
                    result = await bcrypt.compare(password, hash);
                    break;
                case 'hash':
                    result = await bcrypt.hash(password, rounds || 10);
                    break;
                case 'encrypt':
                    processedKey = key.substring(0, 32);
                    if (processedKey.length !== 32) {
                        throw new Error('Key must be 32 characters');
                    }
                    iv = crypto.randomBytes(16);
                    cipher = crypto.createCipheriv('aes-256-cbc', processedKey, iv);
                    encrypted = cipher.update(message, 'utf8', 'hex');
                    encrypted += cipher.final('hex');
                    result = `${iv.toString('hex')}:${encrypted}`;
                    break;
                case 'decrypt':
                    processedKey = key.substring(0, 32);
                    if (processedKey.length !== 32) {
                        throw new Error('Key must be 32 characters');
                    }
                    [ivHex, encrypted] = encrypted_message.split(':');
                    iv = Buffer.from(ivHex, 'hex');
                    decipher = crypto.createDecipheriv('aes-256-cbc', processedKey, iv);
                    decrypted = decipher.update(encrypted, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');
                    result = decrypted;
                    break;
            }
            parentPort.postMessage({ success: true, result });
        } catch (error) {
            parentPort.postMessage({ success: false, error: error.message });
        }
    });
}
// Main thread code
else {
    const workers = [];
    let currentWorker = 0;

    // Initialize worker pool
    const numWorkers = Math.max(1, os.cpus().length - 1);

    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(__filename);
        worker.setMaxListeners(0);
        workers.push(worker);
    }

    function executeWorkerTask(task) {
        // Round-robin worker selection
        const worker = workers[currentWorker];
        currentWorker = (currentWorker + 1) % workers.length;

        return new Promise((resolve, reject) => {
            const messageHandler = (response) => {
                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);

                if (response.success) {
                    resolve(response.result);
                } else {
                    reject(new Error(response.error));
                }
            };

            const errorHandler = (error) => {
                worker.removeListener('message', messageHandler);
                worker.removeListener('error', errorHandler);
                reject(error);
            };

            worker.on('message', messageHandler);
            worker.on('error', errorHandler);
            worker.postMessage(task);
        });
    }

    // Export all functionality
    module.exports = {
        compare: (password, hash) => executeWorkerTask({
            type: 'compare',
            password,
            hash
        }),
        hash: (password, rounds) => executeWorkerTask({
            type: 'hash',
            password,
            rounds
        }),
        encrypt: (key, message) => executeWorkerTask({
            type: 'encrypt',
            key,
            message
        }),
        decrypt: (key, encrypted_message) => executeWorkerTask({
            type: 'decrypt',
            key,
            encrypted_message
        }),
        confirmDecryptedNetworkToken: function(encrypted_message, network) {
            return new Promise(async (resolve, reject) => {
                try {
                    let conn = await dbService.conn();

                    //get secret key for encrypted message
                    let secret_key_qry = await conn('networks_secret_keys')
                        .where('network_id', network.id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_qry) {
                        return reject('Error validating network');
                    }

                    //ensure can decrypt message and it matches my network token
                    let decoded = await module.exports.decrypt(secret_key_qry.secret_key_from, encrypted_message);

                    if (!decoded || decoded !== network.network_token) {
                        return reject('Invalid network_token');
                    }

                    resolve(true);
                } catch (e) {
                    return reject('Error decrypting message');
                }
            });
        },
        confirmDecryptedRegistrationNetworkToken: function(encrypted_message) {
            return new Promise(async (resolve, reject) => {
                try {
                    let conn = await dbService.conn();

                    let my_network = await networkService.getNetworkSelf();

                    if (!my_network || !my_network.registration_network_id) {
                        return reject('Error finding my registration network');
                    }

                    //get secret key for the registration network
                    let secret_key_qry = await conn('networks_secret_keys')
                        .where('network_id', my_network.registration_network_id)
                        .where('is_active', true)
                        .first();

                    if (!secret_key_qry) {
                        return reject('Error finding keys');
                    }

                    //ensure we can decrypt message and it matches my network token
                    let decoded = await module.exports.decrypt(secret_key_qry.secret_key_from, encrypted_message);

                    if (!decoded || decoded !== networkService.token) {
                        return reject('Invalid keys exchange request');
                    }

                    resolve(true);
                } catch (e) {
                    return reject('Error decrypting message');
                }
            });
        },
        destroy: () => {
                for (const worker of workers) {
                    worker.terminate();
                }
                workers.length = 0;
            },
        };
}