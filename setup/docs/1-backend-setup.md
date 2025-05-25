# Backend Setup

**Note**: Initial setup takes 8-12 minutes to complete and requires approximately 2.2GB of memory.

[![Befriend Backend Setup](https://img.youtube.com/vi/YTrRLzxwqdg/0.jpg)](https://www.youtube.com/watch?v=YTrRLzxwqdg)

## Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/befriend-app/befriend-backend.git
   ```

2. Navigate to the project directory:
   ```bash
   cd befriend-backend
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy environment file:
   ```bash
   cp .env.example .env
   ```

5. Open the environment file and configure your database settings:
   ```
   DB_CLIENT=
   DB_HOST=
   DB_NAME=
   DB_USER=
   DB_PASSWORD=
   DB_PORT=
   ```

6. Run the setup:
   ```bash
   node setup
   ```