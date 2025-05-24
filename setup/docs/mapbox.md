# Mapbox API Key

Mapbox is used for rendering maps and calculating travel estimates in Befriend to ensure users can arrive on time to selected places.

https://github.com/user-attachments/assets/c091a00b-e69f-4430-b8ce-3219abdaa3c2

## Setup Steps

1. Go to [mapbox.com](https://mapbox.com)

2. Click "Get started for free" (no credit card required)

3. Create an account

4. Verify your email address

5. Enter billing information

6. Navigate to "Tokens" (under Admin in left pane)

7. Click "Create a token"

8. Enable all scopes for full functionality

9. Set the environment variables in your `.env` file:
   ```
   MAPBOX_USER=your_mapbox_username
   MAPBOX_SECRET_KEY=your_mapbox_secret_key
   ```

### Note

- Use your Mapbox account username for `MAPBOX_USER`