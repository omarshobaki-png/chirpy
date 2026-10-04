# Chirpy

Chirpy is a REST API for a small social media platform where users can create, view, filter, and delete short messages called chirps.

This project was built with TypeScript, Express, PostgreSQL, Drizzle ORM, JWT authentication, and Argon2 password hashing.

## Features

- Create and update users
- Secure password hashing with Argon2
- Login using email and password
- JWT access-token authentication
- Refresh-token creation, renewal, and revocation
- Create, retrieve, filter, sort, and delete chirps
- Authorization checks so users can only delete their own chirps
- Chirpy Red membership upgrades through authenticated webhooks
- PostgreSQL database migrations with Drizzle
- Request metrics and health-check endpoints

## Requirements

Make sure these are installed:

- Node.js
- npm
- PostgreSQL

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/chirpy.git
cd chirpy
```

Install the dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
DB_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/chirpy
PORT=8080
PLATFORM=dev
JWT_SECRET=YOUR_RANDOM_JWT_SECRET
POLKA_KEY=YOUR_POLKA_API_KEY
```

Generate a secure JWT secret with:

```bash
openssl rand -base64 64
```

Do not commit your `.env` file or real secrets to Git.

## Database Setup

Create the PostgreSQL database:

```sql
CREATE DATABASE chirpy;
```

Generate a migration after changing the database schema:

```bash
npx drizzle-kit generate
```

The server automatically runs existing migrations when it starts.

## Running the Project

Build the TypeScript code:

```bash
npm run build
```

Start the development server:

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:8080
```

Run the unit tests:

```bash
npm test
```

## API Endpoints

### Health and administration

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/healthz` | Check whether the server is running |
| `GET` | `/admin/metrics` | View file-server request metrics |
| `POST` | `/admin/reset` | Reset development data |

### Users and authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/users` | Create a user |
| `PUT` | `/api/users` | Update the authenticated user |
| `POST` | `/api/login` | Log in and receive access and refresh tokens |
| `POST` | `/api/refresh` | Exchange a refresh token for a new access token |
| `POST` | `/api/revoke` | Revoke a refresh token |

### Chirps

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/chirps` | Create an authenticated user's chirp |
| `GET` | `/api/chirps` | Retrieve all chirps |
| `GET` | `/api/chirps/:chirpId` | Retrieve one chirp |
| `DELETE` | `/api/chirps/:chirpId` | Delete one of the authenticated user's chirps |

Chirps can be filtered by author:

```text
GET /api/chirps?authorId=USER_UUID
```

They can also be sorted by creation time:

```text
GET /api/chirps?sort=asc
GET /api/chirps?sort=desc
```

Both options can be combined:

```text
GET /api/chirps?authorId=USER_UUID&sort=desc
```

### Webhooks

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/polka/webhooks` | Process authenticated Chirpy Red upgrades |

## Authentication

Protected endpoints expect an access or refresh token using the Bearer authentication scheme:

```text
Authorization: Bearer TOKEN_HERE
```

The Polka webhook expects an API key:

```text
Authorization: ApiKey POLKA_KEY_HERE
```

## Example: Creating a User

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secure-password"}'
```

## Example: Creating a Chirp

```bash
curl -X POST http://localhost:8080/api/chirps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{"body":"Hello from Chirpy!"}'
```

## Technology Stack

- TypeScript
- Node.js
- Express
- PostgreSQL
- Drizzle ORM
- JSON Web Tokens
- Argon2
- Vitest

## License

This project is licensed under the ISC License.