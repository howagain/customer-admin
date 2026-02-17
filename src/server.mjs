// Customer Admin API — reads/writes OpenClaw config file directly
import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// Config file path (can override for different setups)
const CONFIG_PATH = process.env.CONFIG_PATH || '/home/claude/.openclaw/openclaw.json';
const AUTH_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

// Target channel type: 'discord' or 'slack'
const CHANNEL_TYPE = process.env.CHANNEL_TYPE || 'slack';

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

// --- Config helpers ---
function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}`);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(config) {
  const raw = JSON.stringify(config, null, 2);
  writeFileSync(CONFIG_PATH, raw, 'utf8');
}

function restartGateway() {
  try {
    // Try openclaw gateway restart first
    execSync('openclaw gateway restart', { timeout: 10000 });
    return { success: true };
  } catch (err) {
    console.error('Gateway restart failed:', err.message);
    return { success: false, error: err.message };
  }
}

// Deep merge helper (patches nested objects instead of replacing)
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// --- Extract customers from config ---
function extractCustomers(config) {
  const channelConfig = config?.channels?.[CHANNEL_TYPE] || {};
  const channels = channelConfig.channels || {};
  const customers = [];

  for (const [name, chConfig] of Object.entries(channels)) {
    // Match #client-* or client-* pattern
    const cleanKey = name.replace(/^#/, '');
    if (cleanKey.startsWith('client-')) {
      const displayName = cleanKey.replace('client-', '').replace(/-/g, ' ');
      customers.push({
        id: cleanKey,
        channelName: name.startsWith('#') ? name : `#${name}`,
        displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        enabled: chConfig.enabled !== false,
        paid: chConfig.paid !== false,
        systemPrompt: chConfig.systemPrompt || '',
        toolsAllow: chConfig.tools?.allow || [],
        requireMention: chConfig.requireMention ?? false,
        raw: chConfig,
      });
    }
  }
  return customers;
}

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', channelType: CHANNEL_TYPE });
});

// List customers
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const config = readConfig();
    const customers = extractCustomers(config);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single customer
app.get('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const config = readConfig();
    const customers = extractCustomers(config);
    const customer = customers.find(c => c.id === req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add customer
app.post('/api/customers', requireAuth, async (req, res) => {
  try {
    const { channelName, systemPrompt, toolsAllow, paid, requireMention } = req.body;

    if (!channelName || !channelName.trim()) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    // Normalize channel name
    let cleanName = channelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    cleanName = cleanName.replace(/^#/, '').replace(/^client-/, '');
    const fullName = `#client-${cleanName}`;
    const configKey = `client-${cleanName}`;

    // Read current config
    const config = readConfig();

    // Ensure channel structure exists
    if (!config.channels) config.channels = {};
    if (!config.channels[CHANNEL_TYPE]) config.channels[CHANNEL_TYPE] = {};
    if (!config.channels[CHANNEL_TYPE].channels) config.channels[CHANNEL_TYPE].channels = {};

    // Check for duplicates
    if (config.channels[CHANNEL_TYPE].channels[fullName] || 
        config.channels[CHANNEL_TYPE].channels[configKey]) {
      return res.status(409).json({ error: 'Channel already exists' });
    }

    // Build channel config
    const channelConfig = {
      allow: true,
      enabled: true,
      paid: paid !== false,
      requireMention: requireMention ?? false,
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(toolsAllow?.length ? { tools: { allow: toolsAllow } } : {}),
    };

    // Add to config
    config.channels[CHANNEL_TYPE].channels[fullName] = channelConfig;

    // Ensure groupPolicy is allowlist for security
    if (config.channels[CHANNEL_TYPE].groupPolicy !== 'allowlist') {
      config.channels[CHANNEL_TYPE].groupPolicy = 'allowlist';
    }

    // Write config
    writeConfig(config);

    // Restart gateway
    const restartResult = restartGateway();

    res.json({ 
      success: true, 
      customer: { 
        id: `client-${cleanName}`, 
        channelName: fullName, 
        ...channelConfig 
      },
      gatewayRestart: restartResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit customer
app.patch('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { systemPrompt, enabled, paid, toolsAllow, requireMention } = req.body;

    const config = readConfig();
    
    // Find the channel key (might be #client-x or client-x)
    const channelsObj = config.channels?.[CHANNEL_TYPE]?.channels || {};
    let channelKey = null;
    
    if (channelsObj[`#${id}`]) {
      channelKey = `#${id}`;
    } else if (channelsObj[id]) {
      channelKey = id;
    } else {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Apply updates
    const updates = {};
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (enabled !== undefined) updates.enabled = enabled;
    if (paid !== undefined) updates.paid = paid;
    if (requireMention !== undefined) updates.requireMention = requireMention;
    if (toolsAllow !== undefined) updates.tools = { allow: toolsAllow };

    config.channels[CHANNEL_TYPE].channels[channelKey] = {
      ...config.channels[CHANNEL_TYPE].channels[channelKey],
      ...updates
    };

    writeConfig(config);
    const restartResult = restartGateway();

    res.json({ success: true, updated: updates, gatewayRestart: restartResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pause customer
app.post('/api/customers/:id/pause', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const config = readConfig();
    
    const channelsObj = config.channels?.[CHANNEL_TYPE]?.channels || {};
    let channelKey = channelsObj[`#${id}`] ? `#${id}` : (channelsObj[id] ? id : null);
    
    if (!channelKey) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    config.channels[CHANNEL_TYPE].channels[channelKey].enabled = false;
    writeConfig(config);
    const restartResult = restartGateway();

    res.json({ success: true, status: 'paused', gatewayRestart: restartResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate customer
app.post('/api/customers/:id/activate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const config = readConfig();
    
    const channelsObj = config.channels?.[CHANNEL_TYPE]?.channels || {};
    let channelKey = channelsObj[`#${id}`] ? `#${id}` : (channelsObj[id] ? id : null);
    
    if (!channelKey) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    config.channels[CHANNEL_TYPE].channels[channelKey].enabled = true;
    writeConfig(config);
    const restartResult = restartGateway();

    res.json({ success: true, status: 'active', gatewayRestart: restartResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove customer (soft delete - sets enabled: false, deleted: true)
app.delete('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const hardDelete = req.query.hard === 'true';
    
    const config = readConfig();
    
    const channelsObj = config.channels?.[CHANNEL_TYPE]?.channels || {};
    let channelKey = channelsObj[`#${id}`] ? `#${id}` : (channelsObj[id] ? id : null);
    
    if (!channelKey) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (hardDelete) {
      // Actually remove from config
      delete config.channels[CHANNEL_TYPE].channels[channelKey];
    } else {
      // Soft delete
      config.channels[CHANNEL_TYPE].channels[channelKey].enabled = false;
      config.channels[CHANNEL_TYPE].channels[channelKey].deleted = true;
    }

    writeConfig(config);
    const restartResult = restartGateway();

    res.json({ success: true, status: 'removed', hardDelete, gatewayRestart: restartResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get raw config (for debugging)
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const config = readConfig();
    res.json({ 
      channelType: CHANNEL_TYPE,
      channelConfig: config.channels?.[CHANNEL_TYPE] || {} 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Customer Admin API running on :${PORT}`);
  console.log(`Channel type: ${CHANNEL_TYPE}`);
  console.log(`Config path: ${CONFIG_PATH}`);
});
