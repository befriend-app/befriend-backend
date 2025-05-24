# Email From Configuration

Configure the sender address for outgoing emails from your application.

https://github.com/user-attachments/assets/0135001b-6790-49d2-91ee-c63388dee804

## Setup

Set this environment variable to the address used to create your SendGrid sender identity:

```
EMAIL_FROM='Your App Name <hello@your-friends-app.com>'
```

## Format

The email address should follow this format:
- **Display Name**: A friendly name that users will see (e.g., "Your App Name")
- **Email Address**: The actual email address in angle brackets (e.g., `<hello@your-friends-app.com>`)

## Examples

```
EMAIL_FROM='Befriend App <hello@befriend.app>'
EMAIL_FROM='My Social Network <support@mysocialnetwork.com>'
EMAIL_FROM='Community Hub <hello@communityhub.org>'
```

### Notes

- This email address must match the sender identity you created in SendGrid
- Users will see this as the sender when they receive verification emails
- Use a professional email address that represents your application
- Ensure the domain is properly authenticated in SendGrid for better deliverability