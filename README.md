# Backend: befriend.app

## DB Schema

https://drawsql.app/teams/befriend/diagrams/befriend-backend

## Setup

`git clone https://github.com/befriend-app/befriend-backend.git`

`cd befriend-backend`

`npm install`

`cp .env.example .env`

`node scripts/migrate.js`

`node server.js`

- Create test data
    - node mock/add_activity.js --lt 7sro1cyhp3m77p9kr9pq73rf1mmd508i   --pt 14wrx3ttprwhfwseg7vvo799q3l246a3
    - node mock/add_person.js 3

## Running in Docker

**MySQL**

```
docker run --name befriend-mysql \                                                           INT ✘  at 23:23:40  
  -e MYSQL_ROOT_PASSWORD=pass \
  -e MYSQL_DATABASE=befriend \
  -e MYSQL_USER=my_user \
  -e MYSQL_PASSWORD=pass \
  -p 3306:3306 \
  mysql:latest
```

docker exec -it af16ecda17d5 bash    

Sign in as root: `mysql -p`
Sign in as befriend user:  `mysql -u my_user -p befriend`

`docker start befriend-mysql`
`docker stop befriend-mysql`

**Redis**

`docker run -d --name redis-server -p 6379:6379 redis`

Access redis (if the CLI is installed on your machine) redis-cli

Access redis, though container

- docker exec -it <id-of-redis-container> bash
- redis-cli


keys *
smembers "persons:14wrx3ttprwhfwseg7vvo799q3l246a3:login_tokens"

