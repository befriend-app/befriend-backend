# Sign in with Google

Sign in with Google allows users to sign up and log into your app using their existing Google account.

https://github.com/user-attachments/assets/63b10919-d63b-4f23-a357-38c9693d3ff0

### Prerequisites

- Google Account

### 1. Create Google Cloud Project

a. Go to [console.cloud.google.com](https://console.cloud.google.com)

b. Create new project or select existing project

### 2. Configure OAuth Consent Screen

a. Navigate to **API & Services** → **OAuth consent screen**

b. Click **Get started**

c. Add project information:

#### App Information
- **App name**: Enter your app name
- **User support email**: Enter support email address

#### Audience
- Select **External**

#### Contact Information
- **Email address**: Enter developer contact email

d. Click **Finish**

e. Click **Create**

### 3. Add Branding Information

a. Navigate to **Branding**

b. **App name**: Enter your application name

c. **User support email**: Enter support email

d. **App logo**: Upload your app logo

e. **App domain**: Enter your app domain

f. **Authorized domains**: Add authorized domains

- Initial DNS verification of domain required

g. **Developer contact information**: Enter contact details

h. Click **Save**

### 4. Add Test Users

a. Navigate to **Audience**

b. Add test user email addresses for development and testing.

### 5. Create OAuth Client

a. Navigate to **Clients**

b. Click **Create client**

c. Select **iOS** as Application type

d. Set a client name

e. Add **Bundle ID** (this should match your `.env` file's `APPLE_APP_ID` value)

f. Click **Create**

g. Copy the newly created Client ID

*Android coming soon*

### 6. Configure Environment Variables

Set the following environment variable in your `.env` file:

```
IOS_GOOGLE_OAUTH_CLIENT_ID=your_google_client_id_here
```

### 7. Test Implementation

a. Restart backend servers

b. Test signup/login with Google on iOS device or simulator to ensure proper integration.

### 8. Production

a. Navigate to **Audience**

b. Click **Publish app**

c. **Confirm**

d. Navigate to **Verification Center**

e. Click **Prepare for verification**

f. Fill out information and fix any issues

#### Troubleshooting

- Ensure Bundle ID is exactly the same as your app identifier
- Check that test users are added if testing in development mode
- Confirm environment variable is properly set and servers are restarted after change
