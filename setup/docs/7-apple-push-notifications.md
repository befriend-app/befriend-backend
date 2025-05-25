# Apple Push Notifications

**Note**: Apple Developer account required.

Used for sending notifications to users on iOS devices.

https://github.com/user-attachments/assets/74e2cda5-32fb-4261-8fe5-f6354d319802

## Setup Steps

### 1. Enable Push Notifications Capability

1. Login at [developer.apple.com](https://developer.apple.com)

2. Navigate to **Identifiers**

3. Create a new identifier (or select existing)

4. Open your app identifier

5. Enable **Push Notifications** capability

### 2. Create Private Key

1. Click the **+** button next to **Keys**

2. Create a key name

3. Check **Apple Push Notifications service**

4. Click **Configure**

5. Select **Sandbox & Production**

6. Click **Save**

7. Click **Continue**

8. Click **Register**

9. Click **Download** to save the private key file

### 3. Configure Environment Variables

Set the following environment variables in your `.env` file:

```
APPLE_APP_ID=com.yourcompany.yourapp
APPLE_KEY_ID=your_key_id_here
APPLE_TEAM_ID=your_10_character_team_id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
your_private_key_content_here
-----END PRIVATE KEY-----"
```

## Variable Descriptions

- **APPLE_APP_ID**: Your app's Bundle Identifier (e.g., com.yourcompany.yourapp)
- **APPLE_KEY_ID**: The Key ID from your Push Notifications certificate
- **APPLE_TEAM_ID**: Your 10-character Apple Team ID
- **APPLE_PRIVATE_KEY**: The complete content of your downloaded private key file (paste between quotes)

## Note

- The private key should include the full content including the BEGIN/END markers