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
   
    a. Save as `push-ios.p8` in project root
2. Set environment variables
   
    a. `PUSH_IOS_APP_ID`
    
    b. `PUSH_IOS_KEY_ID`

    c. `PUSH_IOS_TEAM_ID`

