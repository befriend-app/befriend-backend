# Backend: befriend.app

## DB Schema

https://drawsql.app/teams/befriend/diagrams/befriend-backend

### Setup

`git clone https://github.com/befriend-app/befriend-backend.git`

`cd befriend-backend`

`npm install`

`cp .env.example .env`

`node scripts/migrate.js`

`node server.js`

### Push Notifications

#### iOS

1. Download Private Key
   
    a. Save as `ios-push.p8` in project root
2. Set environment variables
   
    a. `APPLE_APP_ID`
    
    b. `APPLE_KEY_ID`

    c. `APPLE_TEAM_ID`

