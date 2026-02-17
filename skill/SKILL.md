# Customer Admin Skill

Manage customer access to your bot via channel allowlists.

## Trigger

Activate when user mentions: "customer admin", "add customer", "remove customer", "customer dashboard", "manage customers", "client channels".

## Commands

### Dashboard
- "open customer admin" → provide dashboard URL
- "show customers" → list current customers via API

### Add Customer
- "add customer Acme" → call POST /api/customers with channelName "acme"
- "add customer Bob with prompt 'You are a blog assistant'" → include systemPrompt

### Edit Customer  
- "update Bob's prompt to '...'" → PATCH /api/customers/client-bob
- "pause Bob" → POST /api/customers/client-bob/pause
- "activate Bob" → POST /api/customers/client-bob/activate

### Remove Customer
- "remove customer Bob" → DELETE /api/customers/client-bob (always confirm first)

## API Endpoint

The customer-admin server must be running. Default: `http://localhost:3002`

Set `CUSTOMER_ADMIN_URL` in environment or configure in skill settings.

## Auth

Pass `ADMIN_TOKEN` as Bearer token in Authorization header.
