// Customer Admin API — thin layer over OpenClaw gateway config
import express from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// Gateway config endpoint (override for different setups)
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const AUTH_TOKEN = process.env.ADMIN_TOKEN || 'changeme'; // simple bearer token for MVP

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Gateway helpers ---
async function gatewayRequest(action, body = {}) {
  const resp = await fetch(`${GATEWAY_URL}/api/gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(GATEWAY_TOKEN ? { 'Authorization': `Bearer ${GATEWAY_TOKEN}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gateway ${action} failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function getConfig() {
  return gatewayRequest('config.get');
}

async function patchConfig(patch) {
  return gatewayRequest('config.patch', { raw: JSON.stringify(patch) });
}

// --- Extract customers from config ---
function extractCustomers(config) {
  // Customers are discord channels matching #client-* pattern
  const discord = config?.channels?.discord || {};
  const channels = discord.channels || {};
  const customers = [];

  for (const [name, channelConfig] of Object.entries(channels)) {
    if (name.startsWith('#client-') || name.startsWith('client-')) {
      const cleanName = name.replace(/^#/, '');
      const displayName = cleanName.replace('client-', '').replace(/-/g, ' ');
      customers.push({
        id: cleanName,
        channelName: name.startsWith('#') ? name : `#${name}`,
        displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        enabled: channelConfig.enabled !== false,
        paid: channelConfig.paid !== false,
        systemPrompt: channelConfig.systemPrompt || '',
        toolsAllow: channelConfig.toolsAllow || [],
        raw: channelConfig,
      });
    }
  }
  return customers;
}

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// List customers
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const config = await getConfig();
    const customers = extractCustomers(config);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add customer
app.post('/api/customers', requireAuth, async (req, res) => {
  try {
    const { channelName, systemPrompt, toolsAllow, paid } = req.body;

    if (!channelName || !channelName.trim()) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    const cleanName = channelName.replace(/^#/, '').replace(/^client-/, '');
    const fullName = `#client-${cleanName}`;

    // Check for duplicates
    const config = await getConfig();
    const existing = extractCustomers(config);
    if (existing.find(c => c.id === `client-${cleanName}`)) {
      return res.status(409).json({ error: 'Channel already exists' });
    }

    // Build channel config
    const channelConfig = {
      enabled: true,
      paid: paid !== false,
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(toolsAllow?.length ? { toolsAllow } : {}),
    };

    // Patch only the new channel into existing config
    const patch = {
      channels: {
        discord: {
          channels: {
            [fullName]: channelConfig,
          },
        },
      },
    };

    await patchConfig(patch);
    res.json({ success: true, customer: { id: `client-${cleanName}`, channelName: fullName, ...channelConfig } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit customer
app.patch('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { systemPrompt, enabled, paid, toolsAllow } = req.body;

    const fullName = `#${id}`;
    const updates = {};
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (enabled !== undefined) updates.enabled = enabled;
    if (paid !== undefined) updates.paid = paid;
    if (toolsAllow !== undefined) updates.toolsAllow = toolsAllow;

    const patch = {
      channels: {
        discord: {
          channels: {
            [fullName]: updates,
          },
        },
      },
    };

    await patchConfig(patch);
    res.json({ success: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pause customer
app.post('/api/customers/:id/pause', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {
      channels: { discord: { channels: { [`#${id}`]: { enabled: false } } } },
    };
    await patchConfig(patch);
    res.json({ success: true, status: 'paused' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate customer
app.post('/api/customers/:id/activate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {
      channels: { discord: { channels: { [`#${id}`]: { enabled: true } } } },
    };
    await patchConfig(patch);
    res.json({ success: true, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove customer
app.delete('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // To remove, we need to get config, remove the key, and apply
    // config.patch can't delete keys, so we may need config.apply for removal
    // For now: set enabled: false as soft-delete
    // TODO: implement hard delete via config.apply
    const patch = {
      channels: { discord: { channels: { [`#${id}`]: { enabled: false, deleted: true } } } },
    };
    await patchConfig(patch);
    res.json({ success: true, status: 'removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Customer Admin API running on :${PORT}`);
});
