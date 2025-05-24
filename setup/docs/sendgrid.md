# SendGrid API Key

SendGrid is used for sending email verification codes during the signup and login process.

[![Befriend Sendgrid Setup](https://img.youtube.com/vi/TX4ssFTOOy0/0.jpg)](https://youtu.be/TX4ssFTOOy0)

## Setup Steps

1. Go to [sendgrid.com](https://sendgrid.com)

2. Click "Start for free" (no credit card required)

3. Sign up for an account

4. Verify your email address

5. Verify your phone number

6. Enter your company information

7. **Authenticate your domain:**
    - Enter your domain
    - Choose "Re-brand links for this domain" and click "Yes"
    - Add the provided DNS records to your domain

8. **Create a new sender:**
    - Click "Create sender identity"
    - Enter your sender information

9. **Create an API key:**
    - Click "API Keys"
    - Click "Create API Key"
    - Copy the generated key

10. Set the environment variable in your `.env` file:
    ```
    SENDGRID_KEY=your_sendgrid_api_key_here
    ```

## What This Enables

- Email verification during user signup
- Password reset emails
- Login verification codes
- System notifications via email

### Notes

- Complete domain authentication for better email deliverability
- Use the same email address for sender identity that you'll use in your `EMAIL_FROM` environment variable