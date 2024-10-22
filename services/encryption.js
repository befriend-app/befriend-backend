const crypto = require('crypto');

module.exports = {
    encrypt: function (key, message) {
        return new Promise(async (resolve, reject) => {
            key = key.substring(0, 32);

            if (key.length !== 32) {
                return reject('Key must be 32 characters');
            }

            try {
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
                let encrypted = cipher.update(message, 'utf8', 'hex');
                encrypted += cipher.final('hex');

                return resolve(`${iv.toString('hex')}:${encrypted}`);
            } catch (e) {
                console.error(e);
                return reject('Error encrypting message');
            }
        });
    },
    decrypt: function (key, encrypted_message) {
        return new Promise(async (resolve, reject) => {
            key = key.substring(0, 32);

            if (key.length !== 32) {
                return reject('Key must be 32 characters');
            }

            try {
                const [ivHex, encrypted] = encrypted_message.split(':');
                const iv = Buffer.from(ivHex, 'hex');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');

                resolve(decrypted);
            } catch (e) {
                console.error(e);
                return reject('Error decrypting message');
            }
        });
    },
};
