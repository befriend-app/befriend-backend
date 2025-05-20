const axios = require('axios');

module.exports = {
    country_codes: ['+1', '+44'],
    sendCode: function (phoneNumber, code) {
        return new Promise(async (resolve, reject) => {
            try {
                let message = `Your ${process.env.NETWORK_NAME} code is: ${code}`;

                await module.exports.sendTwilio(phoneNumber, message);
                resolve();
            } catch(e) {
                console.error(e);
                return reject(e);
            }         
        });
    },
    sendTwilio: function(phoneNumber, message) {
        return new Promise(async (resolve, reject) => {
            let ACCOUNT_SID = process.env.TWILIO_SID;
            let AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
            let phoneFrom = process.env.TWILIO_NUMBER;

            try {
                let encodedAuth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

                // Set up the request configuration with Basic Auth
                let config = {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${encodedAuth}`
                    }
                };

                let params = new URLSearchParams();
                params.append('From', phoneFrom);
                params.append('To', phoneNumber);
                params.append('Body', message);

                let response = await axios.post(
                    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
                    params,
                    config
                );

                return resolve(response.data);
            } catch (error) {
                // Handle errors
                if (error.response) {
                    console.error('Error sending message:', error.response.data);
                    return reject(error.response.data);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error('No response received:', error.request);
                    return reject('No response received from Twilio API');
                } else {
                    // Something happened in setting up the request
                    console.error('Error setting up request:', error.message);
                    return reject(error);
                }
            }
        });
    }
};