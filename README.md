# Backend: befriend.app

### Setup

`git clone https://github.com/befriend-app/befriend-backend.git`

`cd befriend-backend`

`npm install`

`cp .env.example .env`

`node setup`

### Run Servers

#### Production
`pm2 start pm2.config.js`

#### Development
`node servers`


### Push Notifications

#### iOS

1. Download Private Key
   
2. Set environment variables

`APPLE_APP_ID=`

`APPLE_KEY_ID=`

`APPLE_TEAM_ID=`

`APPLE_PRIVATE_KEY=""`

