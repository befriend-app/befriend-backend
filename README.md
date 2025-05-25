<div align="left">
    <img src="https://befriend.s3.amazonaws.com/befriend-logo-new.png" alt="Befriend Logo" height="60">
</div>

# Befriend App (Backend)

The best human experience designed for meeting new and existing friends in person.

- Repositories
  - [Frontend](https://github.com/befriend-app/befriend-app)
  - [Data](https://github.com/befriend-app/befriend-data)
  - [Web](https://github.com/befriend-app/befriend-web)
- [Setup video](#setup-video-15-minutes)
- [Prerequisites](#prerequisites)
- [Installation steps](#installation-steps)
    
    - [1. Backend setup](#1-backend-setup)
    - [2. Network information](#2-network-information)
    - [3. Foursquare API key](#3-foursquare-api-key)
    - [4. Mapbox API key](#4-mapbox-api-key)
    - [5. Sendgrid API key](#5-sendgrid-api-key)
    - [6. Email from](#6-email-from)
    - [7. Apple Push Notifications ](#7-apple-push-notifications)
    - [8. Frontend setup](#8-frontend-setup)
    - [9. Running backend & app](#9-running-backend--app)
    - [10. Sending/receiving invitations](#10-sendingreceiving-invitations)
    - [OAuth setup](#oauth-setup)
      - [Signin with Apple](#signin-with-apple)
      - [Signin with Google](#signin-with-google)
      
- [Support us](#support-us)

## Setup Video (15 minutes)

[![Befriend Backend & Frontend Setup Video](https://befriend.s3.amazonaws.com/befriend-developer-setup-poster.jpg)](https://www.youtube.com/watch?v=DAP_-f7f5fs)


## Prerequisites

Ensure you have the following installed on your machine:

-   [Node.js](https://nodejs.org/) (v22 or higher)
-   [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12)
-   [Android Studio](https://developer.android.com/studio)
- MySQL
  - `brew install mysql`

## Installation Steps

### 1.[ Backend setup](./setup/docs/1-backend-setup.md)

**Note**: Initial setup takes 8-12 minutes to complete and requires approximately 2.2GB of memory.

a. `git clone https://github.com/befriend-app/befriend-backend.git`

b. `cd befriend-backend`

c. `npm install`

d. `cp .env.example .env`

e. Open environment file

f. Database configuration

```
DB_CLIENT=
DB_HOST=
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_PORT=
```

g. Run the setup

`node setup`


### 2. [Network information](./setup/docs/2-network-information.md)

These keys are used for identifying your network. A unique network token is automatically generated when your server runs for the first time.

 ```
ADMIN_NAME=""
ADMIN_EMAIL=
NETWORK_NAME="<YOUR_NETWORK_NAME>"
NETWORK_API_DOMAIN=<YOUR_API_DOMAIN>
NETWORK_LOGO=<YOUR_LOGO_URL>
NETWORK_APP_ICON=<YOUR_APP_ICON_URL>
```

### 3. [Foursquare API key](./setup/docs/3-foursquare.md)

Befriend uses Foursquare for displaying places and maps activity types to Foursquare categories to power our activity creation user experience.

a. Go to [developer.foursquare.com](https://developer.foursquare.com)

b. Click get started for free (no credit card required)

c. Create account

d. Verify email

e. Enter profile information

f. Click create a new project

g. Click Generate API Key

h. Set environment variable:

`FSQ_KEY=`

### 4. [Mapbox API key](./setup/docs/4-mapbox.md)

Mapbox is used for rendering maps and calculating travel estimates in Befriend to ensure users can arrive on time to selected places.

a. Go to [mapbox.com](https://mapbox.com)

b. Click get started for free (no credit card required)

c. Create account

d. Verify email

e. Enter billing

f. Click tokens (under Admin in left pane)

g. Click Create a token

h. Enable all scopes

i. Set environment variables:

`MAPBOX_USER=`
- Use your Mapbox account username

`MAPBOX_SECRET_KEY=`


### 5. [Sendgrid API key](./setup/docs/5-sendgrid.md)

SendGrid is used for sending email verification codes during the signup and login process.

a. Go to [sendgrid.com](https://sendgrid.com)

b. Click Start for free (no credit card required)

c. Sign up

d. Verify email

e. Verify phone

f. Enter company information

g. Authenticate domain

- Enter your domain
- Re-brand links for this domain
  - Click Yes
- Add DNS records

h. Create new sender

- Click Create sender identity
  - Enter information

i. Create API key

- Click API Keys
- Click Create API Key

j. Set environment variables:

`SENDGRID_KEY=`


### 6. [Email from](./setup/docs/6-email-from.md)

Set this key to the address used to create your sender identity.

`EMAIL_FROM='Your App Name <hello@your-friends-app.com>'`


### 7. [Apple Push Notifications](./setup/docs/7-apple-push-notifications.md)

**Note**: Apple Developer account required.

Used for sending notifications to users on iOS devices.

#### a. Enable Push Notifications Capability

1. Login at [developer.apple.com](https://developer.apple.com)

2. Navigate to **Identifiers**

3. Create a new identifier (or select existing)

4. Open your app identifier

5. Enable **Push Notifications** capability

#### b. Create Private Key

1. Click the **+** button next to **Keys**

2. Create a key name

3. Check **Apple Push Notifications service**

4. Click **Configure**

5. Select **Sandbox & Production**

6. Click **Save**

7. Click **Continue**

8. Click **Register**

9. Click **Download** to save the private key file

#### c. Configure Environment Variables

Set the following environment variables in your `.env` file:

```
APPLE_APP_ID=
APPLE_KEY_ID=
APPLE_TEAM_ID=
APPLE_PRIVATE_KEY=""
```


#### Variable Descriptions

- **APPLE_APP_ID**: Your app's Bundle Identifier (e.g., com.yourcompany.yourapp)
- **APPLE_KEY_ID**: The Key ID from your Push Notifications certificate
- **APPLE_TEAM_ID**: Your 10-character Apple Team ID
- **APPLE_PRIVATE_KEY**: The complete content of your downloaded private key file (paste between quotes)


### 8. [Frontend setup](./setup/docs/8-frontend-setup.md)

a. Clone repository

`git clone https://github.com/befriend-app/befriend-app`

b. Navigate to directory

`cd befriend-app`

c. Install packages

```
npm install -g cordova
npm install cordova-icon -g
npm install
```

d. Add platforms

```
cordova platform add ios@7
cordova platform add android@12
```

e. Install OS requirements

```
node scripts/install/ios.js
node scripts/install/android.js
```

f. Run development server

*When the app is built with the --dev flag, app.js and styles.css is loaded from a local server as opposed to from the device. This allows for much quicker development without having to rebuild the app each time.*

`node scripts/dev/serve.js`

g. Build app

#### Production

`node scripts/build/device.js`

#### Development

`node scripts/build/device.js --dev http://localhost:3010 --api http://localhost:3000 --ws ws://localhost:8080`

| Option | Description |
|--------|-------------|
| `--dev` | Frontend development server host |
| `--api` | Backend server host |
| `--ws` | Websocket server host |
| `--ios` | Build for iOS only |
| `--android` | Build for Android only |


h. Open Platform Project

- iOS
  - Open Xcode
  - Open project folder
    - befriend-app/platforms/ios
- Android
  - Coming soon

### 9. [Running backend & app](./setup/docs/9-running-backend-and-app.md)

#### Backend

a. Start Backend Servers

```bash
cd befriend-backend
node servers
```

#### App

b. Run Device 1

*Launch the first device/simulator for testing.*

c. Run Device 2

*Launch the second device/simulator for testing multi-user functionality.*

#### Create Test Users

d. Signup User 1

*Create the first test user account on device 1.*

e. Signup User 2

*Create the second test user account on device 2.*

### 10. [Sending/receiving invitations](./setup/docs/10-sending-receiving-invitations.md)

#### Sender

- Select activity type
- Choose place
- Send

#### Receiver
- Set availability (optional)
- Receive invitation
- Accept

### OAuth Setup

### [Signin with Apple](./setup/docs/11-signin-with-apple.md)

Sign in with Apple allows users to sign up and log into your app using their existing Apple ID.

#### Prerequisites

- Apple Developer Account (paid membership required)

#### 1. Enable Sign in with Apple Capability

- Login at [developer.apple.com](https://developer.apple.com)

- Navigate to **Certificates, Identifiers & Profiles**

- Click **Identifiers**

- Select your app identifier (or create a new one)

- Scroll down to **Capabilities** section

- Enable **Sign In with Apple** capability

- Click **Save**

### 2. Test Implementation

a. Build and run your app on a physical iOS device (Sign in with Apple doesn't work in simulator)

b. Test the Sign in with Apple flow

c. Verify user authentication and account creation

### [Signin with Google](./setup/docs/11-signin-with-google.md)

Sign in with Google allows users to sign up and log into your app using their existing Google account.

#### Prerequisites

- Google Account

#### 1. Create Google Cloud Project

- Go to [console.cloud.google.com](https://console.cloud.google.com)
- Create new project or select existing project

#### 2. Configure OAuth Consent Screen

- Navigate to **API & Services** → **OAuth consent screen**
- Click **Get started**
- Add project information
  - #### App Information
    - **App name**: Enter your app name
    - **User support email**: Enter support email address
  - #### Audience
    - Select **External**
    - #### Contact Information
    - **Email address**: Enter developer contact email 
  - Click **Finish**
  - Click **Create**

#### 3. Add Branding Information

- Navigate to **Branding**
- **App name**: Enter your application name
- **User support email**: Enter support email
- **App logo**: Upload your app logo
- **App domain**: Enter your app domain
- **Authorized domains**: Add authorized domains
    - Initial DNS verification of domain required
- **Developer contact information**: Enter contact details
- Click **Save**

#### 4. Add Test Users

- Navigate to **Audience**
- Add test user email addresses for development and testing.

#### 5. Create OAuth Client

- Navigate to **Clients**
- Click **Create client**
- Select **iOS** as Application type
- Set a client name
- Add **Bundle ID** (this should match your `.env` file's `APPLE_APP_ID` value)
- Click **Create**
- Copy the newly created Client ID

*Android coming soon*

#### 6. Configure Environment Variables

Set the following environment variable in your `.env` file:

```
IOS_GOOGLE_OAUTH_CLIENT_ID=your_google_client_id_here
```

#### 7. Test Implementation

- Restart backend servers

- Test signup/login with Google on iOS device or simulator to ensure proper integration.

#### 8. Production

- Navigate to **Audience**

- Click **Publish app**

- **Confirm**

- Navigate to **Verification Center**

- Click **Prepare for verification**

- Fill out information and fix any issues

## Support us

### Users
1. **Sign up** - Go to [befriend.app](https://befriend.app)
2. **Spread the word** - Ask friends, family, and social media followers to sign up

### Developers
3. **Run own network** - Join the Befriend network and bring real-time in-person friends to your area or community with your own brand name and logo
4. **Contribute code** - Clone our repositories, submit pull requests, implement new features, and fix bugs
5. **Report issues** - Help us improve by reporting bugs and suggesting features

### Organizations
6. **Become a sponsor** - Email us at [sponsor@befriend.app](mailto:sponsor@befriend.app)

### Our sponsors

#### Gen AI Wear
Create unique custom apparel at [genaiwear.com](https://genaiwear.com)
