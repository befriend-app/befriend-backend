# Sign in with Apple

Sign in with Apple allows users to sign up and log into your app using their existing Apple ID.


https://github.com/user-attachments/assets/34389c16-0d2a-4786-b15b-e258be2fc594


## Prerequisites

- Apple Developer Account (paid membership required)

## Setup Steps

### 1. Enable Sign in with Apple Capability

a. Login at [developer.apple.com](https://developer.apple.com)

b. Navigate to **Certificates, Identifiers & Profiles**

c. Click **Identifiers**

d. Select your app identifier (or create a new one)

e. Enable **Sign In with Apple** capability

f. Click **Save**

### 2. Test Implementation

a. Build and run your app on a physical iOS device (Sign in with Apple doesn't work in simulator)

b. Test the Sign in with Apple flow

c. Verify user authentication and account creation

## Important Notes

- Sign in with Apple requires testing on physical iOS devices
- Users can choose to hide their email address
- Apple requires apps that offer third-party login options to also offer Sign in with Apple

## Troubleshooting

- Verify Identifier matches Bundle identifier in Xcode
- Check that Sign in with Apple capability is enabled in the Developer Portal
- Test on a physical device rather than simulator
