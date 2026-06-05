# GDSHub — GDS Management System

Internal tool for managing GDS platforms, PCC codes, user assignments, and OTA clients.  
Built with Next.js 15, Supabase, and TailwindCSS.

---

## Tech Stack

| Layer        | Tool                        |
|--------------|-----------------------------|
| Frontend     | Next.js 15 (App Router)     |
| Styling      | TailwindCSS                 |
| Database     | Supabase (PostgreSQL)       |
| Auth         | Supabase Auth               |
| Language     | TypeScript                  |

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo>
cd gdshub
npm install
```

### 2. Set up Supabase

1. Create a project at https://supabase.com
2. Go to SQL Editor and run the full `supabase_migration.sql`
3. Copy your Project URL and anon key

### 3. Configure environment

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000

---

## First Login

1. Go to Supabase Dashboard → **Authentication → Users**
2. Click **Add User** → enter your email and password
3. Sign in at http://localhost:3000/login
4. To make yourself admin, run in SQL Editor:

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = 'your-user-uuid';
```

---

## Project Structure

```
gdshub/
├── app/
│   ├── login/           # Login page
│   └── (dashboard)/     # Protected routes
│       ├── dashboard/   # Home with stats
│       ├── users/       # Users CRUD ✅
│       ├── gds/         # GDS list
│       ├── pcc/         # PCC management
│       ├── sabre-users/     # Sabre accounts
│       ├── amadeus-users/   # Amadeus accounts
│       ├── travelport-users/ # Travelport accounts
│       ├── gds-assigned/    # User-GDS assignments
│       ├── ota-clients/     # OTA companies
│       ├── midoffice/       # Mid-office config
│       └── admin/           # Admin role management
├── components/
│   ├── layout/          # Sidebar, TopBar
│   └── shared/          # DataTable, Modal, StatCard, PageHeader
├── lib/
│   ├── supabase/        # client.ts + server.ts
│   └── utils.ts         # cn() helper
├── types/
│   └── index.ts         # All TypeScript types
└── middleware.ts         # Auth route protection
```

---

## Roles

| Role  | Permissions                        |
|-------|------------------------------------|
| admin | Full CRUD on all tables            |
| user  | Read-only access to all tables     |

---

## Development Notes

- The `Users` page (`/users`) is the **fully built CRUD template** — all other pages follow the same pattern
- Each page imports `DataTable`, `Modal`, and `PageHeader` from `/components/shared`
- Auth is handled by Supabase middleware — no page is accessible without login
- RLS policies enforce role-based access at the database level

