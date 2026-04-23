# FishFind Web (FFWeb)

Angular frontend plus Express/MySQL backend for account registration, email activation, login, profile management, and suspended-user access control.

## Features

### Frontend
- Angular 21 standalone app
- Login and registration UI
- Email activation flow
- Signed-in header account link to profile
- Profile view with email, phone, and password management
- Password change and account deletion
- App-wide 404 view for suspended users when the backend denies access

### Backend
- Express API with MySQL user storage via `mysql2`
- JWT authentication
- Email activation token generation and delivery
- Suspended-user blocking at the backend level with `404` responses
- Automatic schema creation for the `users` table on startup
- MariaDB/MySQL can run locally or inside the Docker container
- Docker runtime stores MariaDB data on `/var/lib/mysql`, which can be mounted to a host disk or Docker volume

## Routes

- `/` home
- `/login` login and registration screen
- `/activate/:activationToken` email activation
- `/profile` authenticated profile page
- `/not-found` not found page

## API Endpoints

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/activate/:activationToken`
- `GET /api/auth/validate`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `PUT /api/auth/change-password`
- `DELETE /api/auth/account`

### Utility
- `GET /api/health`

## Suspended User Behavior

- Suspended users are blocked in the backend.
- Authenticated suspended users receive `404` from protected auth endpoints.
- Requests from a suspended user network can also be blocked with `404`.
- The frontend watches for these `404` responses and renders the site-wide not-found screen instead of the normal app shell.

## Quick Start

### Prerequisites
- Node.js 20+
- npm

### Frontend

```bash
npm install
npm start
```

Frontend runs at `http://localhost:4200`.

### Backend

```bash
cd backend
npm install
npm start
```

Backend runs at `http://localhost:3000`.

## Docker

Build and run:

```bash
docker build -t fishfind-web .
docker run -d -p 8080:80 -v fishfind_mysql:/var/lib/mysql --name fishfind-app fishfind-web
```

App runs at `http://localhost:8080`.

For Rancher Desktop or another local persistent disk path, use a bind mount instead of a named volume:

```bash
docker run -d -p 8080:80 -v C:\rancher-data\fishfind-mysql:/var/lib/mysql --name fishfind-app fishfind-web
```

## Environment Variables

Create `backend/.env`:

```env
PORT=3000
JWT_SECRET=42DC378C-52C6-4639-9F45-577A9BD02FAF
FRONTEND_BASE_URL=http://localhost:8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=fishfind_app
DB_PASSWORD=fishfind_app_password
DB_NAME=fishfind
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=fishfind.info
SMTP_PASS=your-smtp-password
MAIL_FROM=mbna@fishfind.info
```

## Development Commands

```bash
# Frontend
npm start
npm run build
npm test -- --watch=false

# Backend
cd backend
npm start
npm run dev
```

## Running Tests in VS Code

Open the `ffweb` folder in VS Code, then open `Terminal` -> `New Terminal`.

Run all frontend tests once:

```bash
npm test -- --watch=false
```

Run only the suspended-user frontend regression test:

```bash
npx ng test --watch=false --include src/app/app.spec.ts
```

Current note:
- The focused `app.spec.ts` command is the cleanest way to verify the suspended-user 404 fix.
- The full frontend suite still has older auth-spec issues unrelated to this fix.

## Database Notes

The backend now uses MySQL/MariaDB instead of SQLite.

The schema lives in [backend/auth.sql](./backend/auth.sql), and the backend creates the `users` table on startup if it does not already exist.

Current table columns include:
- `id`
- `username`
- `email`
- `password`
- `ip4`
- `ip6`
- `titul`
- `lastVisit`
- `question`
- `answer`
- `cell`
- `suspended`
- `agent`
- `confirmed`
- `confirmation_token`
- `created_at`
- `updated_at`

Notes:
- Login writes `lastVisit` using MySQL `DATETIME` format.
- Docker persistence should be handled with a volume or bind mount on `/var/lib/mysql`.
- There is no `users.db` SQLite file anymore.

## Troubleshooting

### Login or registration problems

- Make sure the backend is running on port `3000`.
- Check browser dev tools for the real API error body.
- Confirm SMTP settings if activation emails are not arriving.

### Suspended-user testing

- If a suspended user can still see pages, verify the backend returns `404` from auth endpoints for that user.
- Then run:

```bash
npx ng test --watch=false --include src/app/app.spec.ts
```

### Helpful docs

- [registration_error_debug.md](./registration_error_debug.md)
- [LOGIN_TROUBLESHOOTING.md](./LOGIN_TROUBLESHOOTING.md)
- [QUICK_START_TESTING.md](./QUICK_START_TESTING.md)

## Project Structure

```text
ffweb/
├── src/
│   └── app/
│       ├── app.routes.ts
│       ├── app.spec.ts
│       ├── auth.service.ts
│       ├── auth/
│       ├── not-found/
│       └── profile/
├── backend/
│   ├── auth.sql
│   ├── package.json
│   └── server.js
├── Dockerfile
└── supervisord.conf
```


Terminal 1, start the backend:  8 vulnerabilities (2 low, 6 high)

cd  backend
npm install
npm start
You should see `[backend-init] server running on port 3000`.

Terminal 2, start the frontend:

cd c:\envoinx\fishfind\fishfind-frontend\ffweb
npm install
npm start
Then open http://localhost:8080.

If it still fails in local dev, the main thing to check is that nothing else is already using port 3000, because the frontend proxy expects the FishFind backend there. For the all-in-one production-style container, rebuild and run:

cd c:\envoinx\fishfind\fishfind-frontend\ffweb
npm run build

---- in docker
PS>
docker build -t fishfind-web .
## delete contatiner from Rancher 
docker run -d -p 8080:80 -v fishfind_mysql:/var/lib/mysql --name fishfind-app fishfind-web
