# Facilitator Setup Guide

## Important: Creating Your First Facilitator Account

The facilitator login requires both:
1. A Supabase Auth user account
2. A corresponding `facilitator_users` record linked to an organization

## Quick Setup Steps

### Step 1: Create Organization (if needed)

Run this SQL in your Supabase SQL Editor:

```sql
-- Create an organization
INSERT INTO organizations (id, name, industry)
VALUES (
  gen_random_uuid(),
  'Your Organization Name',
  'Your Industry'
)
RETURNING id, name;
```

Copy the returned `id` for the next step.

### Step 2: Create User Account

1. Go to `/auth/login` in your app
2. Click "Need an account? Create one"
3. Enter email and password
4. If email confirmation is required, check your email and confirm
5. Copy your user ID from Supabase Dashboard → Authentication → Users

OR create directly via SQL:

```sql
-- This creates a user without email confirmation
-- Replace with your email and desired password
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'your-email@example.com',
  crypt('your-password', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
RETURNING id, email;
```

### Step 3: Link User to Organization

Run this SQL with your user_id and organization_id:

```sql
-- Link the user to the organization as a facilitator
INSERT INTO facilitator_users (
  user_id,
  organization_id,
  display_name,
  role
) VALUES (
  'YOUR_USER_ID_HERE',  -- from Step 2
  'YOUR_ORG_ID_HERE',   -- from Step 1
  'Your Display Name',
  'owner'  -- Can be: owner, admin, or facilitator
);
```

### Step 4: Verify Setup

```sql
-- Verify the setup
SELECT 
  u.email,
  fu.display_name,
  fu.role,
  o.name as organization
FROM auth.users u
JOIN facilitator_users fu ON fu.user_id = u.id
JOIN organizations o ON o.id = fu.organization_id
WHERE u.email = 'your-email@example.com';
```

## Complete Setup Script

Here's a complete SQL script that creates everything:

```sql
-- 1. Create organization
INSERT INTO organizations (id, name, industry)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Demo Organization',
  'Technology'
);

-- 2. Create auth user (using pgcrypto for password hashing)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'b0000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'admin@demo.com',
  crypt('Admin123!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}'
);

-- 3. Create facilitator_user record
INSERT INTO facilitator_users (
  user_id,
  organization_id,
  display_name,
  role
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Admin User',
  'owner'
);

-- Verify
SELECT 
  u.email,
  fu.display_name,
  fu.role,
  o.name as organization
FROM auth.users u
JOIN facilitator_users fu ON fu.user_id = u.id
JOIN organizations o ON o.id = fu.organization_id;
```

## Default Test Credentials (after running above script)

- **Email:** admin@demo.com
- **Password:** Admin123!

## Troubleshooting

### "Access Denied" after login

**Cause:** Your user account exists but isn't linked to a facilitator_users record.

**Fix:** Run Step 3 above to link your user to an organization.

### "Authentication failed"

**Causes:**
1. Wrong email/password
2. Email not confirmed (if confirmation is enabled)
3. Supabase connection issues

**Fix:** 
- Verify credentials
- Check Supabase Dashboard → Authentication → Users
- Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set

### Can't access /admin after login

**Cause:** Middleware not detecting session cookies.

**Fix:** 
1. Clear browser cookies
2. Try in incognito/private mode
3. Check browser console for errors
4. Verify Supabase project URL matches .env

## Environment Variables

Ensure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_TOKEN_SECRET=your-32-character-secret
```

## Running a Gallery Activity (Projected Gallery Wall)

A **gallery step** turns a step into an image activity: participants generate an image in an AI
tool, drop or paste it into Workshop Copilot, and it appears on a shared screen the whole room
watches once you reveal it.

### ⚠️ Mark gallery steps BEFORE creating the session

Sessions freeze a copy of the template at creation time. Ticking "Gallery step" on a template
afterwards does **not** reach a session that already exists, and the only mechanism that would
re-copy it (**Resync**) deletes the session's snapshot — which cascade-deletes **every submission
already collected**. Resync is also refused once a session is live.

So the order is: tick the box in the template → *then* create the session.

### Setup

1. In the template editor, open a step and tick **Gallery step**.
   Instructions, prompt blocks and the AI-tool button are hidden for participants on that step,
   because the prompt belongs on the big screen. Write the activity prompt as the step's
   `Objective:` line — that is what the wall displays large.
2. Create a session from that template and start it.
3. Open **Project Gallery Wall** from the presenter console's quick actions (opens in a new tab)
   and drag that tab to the projector, then press the fullscreen control or `F`.

### Running it

| Action | Control | Key |
|---|---|---|
| Previous / next gallery activity | Arrows in the control bar | `←` / `→` |
| Reveal (or re-hide) responses | Reveal / Revealed | `R` |
| Show or hide participant names | Names | `N` |
| Show or hide captions | Captions | `C` |
| Fullscreen | Maximise icon | `F` |
| Page through a large gallery | Page arrows (appear only when needed) | `PageUp` / `PageDown` |
| Spotlight one image | Click a tile | — |
| Leave spotlight | Click anywhere, or Back to gallery | `Backspace` |
| Spotlight a random image | Random | — |

Before you reveal, the wall shows a live count ("18 / 24 submitted") and nothing else, which
builds anticipation and stops the room anchoring on whoever submitted first. **You only press
Reveal once** — anyone who submits afterwards appears automatically.

`Backspace` closes the spotlight rather than `Escape`, because browsers reserve `Escape` for
leaving fullscreen and will not let a page intercept it.

### If somebody submits something you would rather not show

Click the tile to spotlight it, then **Hide from wall**. It disappears from the projected wall
immediately and stays hidden across refreshes. To bring it back, open the Submission Gallery,
click the image, and choose **show again**. Submissions are visible by default — this is a safety
valve, not an approval queue.

### Notes

- Participants keep navigating at their own pace. Changing the activity on the wall does **not**
  move anyone's screen.
- The status indicator top-right reads **Live** when updates are streaming. **Reconnecting…** means
  it has fallen back to polling — submissions still arrive, just a few seconds slower.
- Reveal state resets if you refresh the projector tab.
- Large images are shrunk automatically in the participant's browser before upload, so nobody hits
  the 5MB limit.

## Testing the Flow

1. **Sign Up:** Go to `/auth/login` → Create account
2. **Create Facilitator Link:** Run SQL from Step 3
3. **Sign In:** Use your credentials
4. **Access Admin:** Should redirect to `/admin` dashboard
5. **Create Template:** Test creating a workshop template
6. **Launch Session:** Create a session and get join code

## Role Permissions

- **owner:** Full access, can manage organization settings
- **admin:** Can manage templates, sessions, and facilitators
- **facilitator:** Can create and run sessions

Currently, all roles have the same permissions (to be refined in future updates).
