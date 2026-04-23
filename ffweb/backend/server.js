const fs = require('fs');
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const net = require('net');
const { normalizeProfileUpdate, isLoopbackNetwork } = require('./profile-update');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:8080';
const AUTH_SQL_PATH = path.join(__dirname, 'auth.sql');
const MYSQL_HOST = process.env.DB_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.DB_PORT || 3306);
const MYSQL_USER = process.env.DB_USER || 'root';
const MYSQL_PASSWORD = process.env.DB_PASSWORD || '';
const MYSQL_DATABASE = process.env.DB_NAME || 'fishfind';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vertex';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fishfind.info';
const ACTIVATION_LINK_EXPIRY_MINUTES = 30;
const GUEST_PAGE_LIMIT = 100;
const GUEST_BAN_DURATION_MS = 60 * 60 * 1000;
const AUTHENTICATED_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const guestBanByNetwork = new Map();
const authenticatedSessionTimeouts = new Map();

function maskLoginValue(login) {
  if (typeof login !== 'string' || !login.trim()) {
    return '[missing]';
  }

  if (login.includes('@')) {
    const [localPart, domainPart] = login.split('@');
    const visibleLocal = localPart.slice(0, 2);
    return `${visibleLocal}${'*'.repeat(Math.max(localPart.length - 2, 0))}@${domainPart}`;
  }

  const visiblePrefix = login.slice(0, 2);
  return `${visiblePrefix}${'*'.repeat(Math.max(login.length - 2, 0))}`;
}

function logBackendEvent(event, details = {}) {
  console.log(`[backend] ${new Date().toISOString()} ${event}`, details);
}

function toMysqlDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getClientNetworkDetails(req) {
  const rawIp = typeof req.ip === 'string' ? req.ip.trim() : '';
  const agent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].trim() : '';

  if (!rawIp) {
    return {
      rawIp: 'unknown',
      ip4: '',
      ip6: '',
      agent
    };
  }

  const mappedIpv4 = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : '';
  const mappedIpv4IsValid = net.isIP(mappedIpv4) === 4;
  const normalizedIp = mappedIpv4IsValid ? mappedIpv4 : rawIp;
  const normalizedIpVersion = net.isIP(normalizedIp);
  const rawIpVersion = net.isIP(rawIp);

  return {
    rawIp: normalizedIp,
    ip4: normalizedIpVersion === 4 ? normalizedIp : '',
    ip6: rawIpVersion === 6 ? rawIp.toLowerCase() : (normalizedIpVersion === 6 ? normalizedIp.toLowerCase() : ''),
    agent
  };
}

function getClientIpAddress(req) {
  return getClientNetworkDetails(req).rawIp;
}

function getNetworkBanKey(network, userAgent = '') {
  return `${network.ip4 || '-'}|${network.ip6 || '-'}|${userAgent || '-'}`;
}

function getOptionalAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function clearExpiredGuestBan(networkBanKey) {
  const existingBan = guestBanByNetwork.get(networkBanKey);
  if (!existingBan) {
    return null;
  }

  if (existingBan.expiresAt <= Date.now()) {
    guestBanByNetwork.delete(networkBanKey);
    return null;
  }

  return existingBan;
}

function scheduleAuthenticatedSessionTimeout(sessionId) {
  const existingTimeout = authenticatedSessionTimeouts.get(sessionId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutHandle = setTimeout(() => {
    authenticatedSessionTimeouts.delete(sessionId);
    db.run(
      `
        UPDATE SessionHandler
        SET endSess = COALESCE(endSess, CURRENT_TIMESTAMP)
        WHERE id = ?
      `,
      [sessionId],
      (err) => {
        if (err) {
          console.error(`Error timing out session ${sessionId}:`, err.message);
        }
      }
    );
  }, AUTHENTICATED_SESSION_TIMEOUT_MS);

  authenticatedSessionTimeouts.set(sessionId, timeoutHandle);
}

function stopAuthenticatedSessionTimeout(sessionId) {
  const existingTimeout = authenticatedSessionTimeouts.get(sessionId);
  if (!existingTimeout) {
    return;
  }

  clearTimeout(existingTimeout);
  authenticatedSessionTimeouts.delete(sessionId);
}

const userTableColumns = [
  { name: 'ip4', definition: 'VARCHAR(45)' },
  { name: 'ip6', definition: 'VARCHAR(45)' },
  { name: 'titul', definition: 'VARCHAR(255)' },
  { name: 'lastVisit', definition: 'DATETIME' },
  { name: 'question', definition: 'TEXT' },
  { name: 'answer', definition: 'TEXT' },
  { name: 'cell', definition: 'VARCHAR(255)' },
  { name: 'suspended', definition: 'TINYINT(1) DEFAULT 0' },
  { name: 'agent', definition: 'TEXT' },
  { name: 'confirmation_token_created_at', definition: 'DATETIME' }
];

function getActivationExpiryDate(date = new Date()) {
  return new Date(date.getTime() + (ACTIVATION_LINK_EXPIRY_MINUTES * 60 * 1000));
}

function isActivationExpired(createdAtValue) {
  if (!createdAtValue) {
    return true;
  }

  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.getTime())) {
    return true;
  }

  return Date.now() - createdAt.getTime() > (ACTIVATION_LINK_EXPIRY_MINUTES * 60 * 1000);
}

function buildActivationEmailHtml(username, activationUrl) {
  const expirationTime = getActivationExpiryDate();

  return `
    <p>Hello ${username},</p>
    <p>Your FishFind account has been created.</p>
    <p>Please activate your account by clicking the link below:</p>
    <p><a href="${activationUrl}">${activationUrl}</a></p>
    <p>This activation link expires in ${ACTIVATION_LINK_EXPIRY_MINUTES} minutes.</p>
    <p>Link expires at ${expirationTime.toUTCString()}.</p>
  `;
}

function sendActivationEmail({ username, email, activationUrl }, callback) {
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@fishfind.info',
    to: email,
    subject: 'Activate your FishFind account',
    html: buildActivationEmailHtml(username, activationUrl)
  };

  transporter.sendMail(mailOptions, callback);
}

function isDuplicateEntryError(error) {
  if (!error) {
    return false;
  }

  return error.code === 'ER_DUP_ENTRY' || error.errno === 1062 || error.message.includes('UNIQUE constraint failed');
}

function getStoredIpColumns(ipValue) {
  if (typeof ipValue !== 'string' || !ipValue.trim()) {
    return { ip4: '', ip6: '' };
  }

  const trimmedIp = ipValue.trim();

  if (trimmedIp.startsWith('::ffff:')) {
    const extractedIpv4 = trimmedIp.slice(7);
    if (net.isIP(extractedIpv4) === 4) {
      return {
        ip4: extractedIpv4,
        ip6: trimmedIp.toLowerCase()
      };
    }
  }

  const ipVersion = net.isIP(trimmedIp);

  if (ipVersion === 4) {
    return { ip4: trimmedIp, ip6: '' };
  }

  if (ipVersion === 6) {
    return { ip4: '', ip6: trimmedIp.toLowerCase() };
  }

  return { ip4: '', ip6: '' };
}

app.use(helmet());
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  const network = getClientNetworkDetails(req);
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].trim() : '';
  const optionalUser = getOptionalAuthenticatedUser(req);
  const networkBanKey = getNetworkBanKey(network, userAgent);
  const activeBan = clearExpiredGuestBan(networkBanKey);

  if (activeBan && !optionalUser) {
    return res.status(511).json({
      error: 'Network Authentication Required',
      message: 'Guest access is blocked for one hour after more than 100 page reads.'
    });
  }

  logBackendEvent('request.start', {
    method: req.method,
    path: req.originalUrl,
    ip: network.rawIp
  });

  res.on('finish', () => {
    logBackendEvent('request.finish', {
      method: req.method,
      path: req.originalUrl,
      ip: network.rawIp,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.smtp2go.com',
  port: Number(process.env.SMTP_PORT) || 2525,
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: false
});

const db = {
  exec(sql, callback) {
    pool.query(sql)
      .then(() => callback(null))
      .catch((error) => callback(error));
  },
  serialize(callback) {
    callback();
  },
  get(sql, params, callback) {
    pool.execute(sql, params)
      .then(([rows]) => callback(null, rows[0]))
      .catch((error) => callback(error));
  },
  all(sql, params, callback) {
    const resolvedParams = typeof params === 'function' ? [] : params;
    const resolvedCallback = typeof params === 'function' ? params : callback;

    pool.execute(sql, resolvedParams)
      .then(([rows]) => resolvedCallback(null, rows))
      .catch((error) => resolvedCallback(error));
  },
  run(sql, params, callback = () => {}) {
    const resolvedParams = typeof params === 'function' ? [] : params;
    const resolvedCallback = typeof params === 'function' ? params : callback;

    pool.execute(sql, resolvedParams)
      .then(([result]) => {
        resolvedCallback.call(
          {
            lastID: result.insertId ?? 0,
            changes: result.affectedRows ?? 0
          },
          null
        );
      })
      .catch((error) => resolvedCallback(error));
  },
  close(callback) {
    pool.end()
      .then(() => callback?.(null))
      .catch((error) => callback?.(error));
  }
};

function createTables() {
  fs.readFile(AUTH_SQL_PATH, 'utf8', (readErr, schemaSql) => {
    if (readErr) {
      console.error(`Error reading auth schema file at ${AUTH_SQL_PATH}:`, readErr.message);
      return;
    }

    db.exec(schemaSql, (execErr) => {
      if (execErr) {
        console.error('Error creating schema tables:', execErr.message);
      } else {
        console.log('Schema tables created or already exist.');
        ensureUsersTableColumns();
        ensureDefaultAdminUser();
        ensureGlobalConfigurationDefaults();
      }
    });
  });
}

function ensureDefaultAdminUser() {
  const sql = 'SELECT id, username, email FROM users WHERE username = ? LIMIT 1';

  db.get(sql, [DEFAULT_ADMIN_USERNAME], async (lookupErr, existingUser) => {
    if (lookupErr) {
      console.error('Error checking default admin user:', lookupErr.message);
      return;
    }

    if (existingUser) {
      console.log(`[backend-init] default admin user '${DEFAULT_ADMIN_USERNAME}' already exists`);
      return;
    }

    try {
      const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      const insertSql = `
        INSERT INTO users (
          username,
          email,
          password,
          confirmed,
          ip4,
          ip6,
          titul,
          question,
          answer,
          cell,
          agent
        )
        VALUES (?, ?, ?, 1, '', '', '', '', '', '', 'system-seed')
      `;

      db.run(
        insertSql,
        [DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL, hashedPassword],
        function (insertErr) {
          if (insertErr) {
            console.error('Error creating default admin user:', insertErr.message);
            return;
          }

          console.log(`[backend-init] created default admin user '${DEFAULT_ADMIN_USERNAME}'`);
        }
      );
    } catch (error) {
      console.error('Error hashing default admin password:', error.message);
    }
  });
}

function ensureGlobalConfigurationDefaults() {
  const sql = `
    INSERT INTO global_configuration (
      config_attribute,
      config_value,
      global_config_default_value,
      global_config_user_name,
      global_config_updatedate,
      global_config_type,
      global_configuration_sysflag
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), ?, ?)
    ON DUPLICATE KEY UPDATE
      config_value = config_value
  `;

  db.run(sql, ['counter', '517984', '517984', null, 'number', 0], (err) => {
    if (err) {
      console.error('Error ensuring global configuration defaults:', err.message);
      return;
    }

    console.log("Ensured default global_configuration row for 'counter'.");
  });
}

function ensureUsersTableColumns() {
  const columnInfoSql = `
    SELECT COLUMN_NAME AS name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
  `;

  db.all(columnInfoSql, (err, columns) => {
    if (err) {
      console.error('Error reading users table schema:', err.message);
      return;
    }

    const existingColumnNames = new Set(columns.map((column) => column.name));
    const missingColumns = userTableColumns.filter((column) => !existingColumnNames.has(column.name));

    db.serialize(() => {
      missingColumns.forEach((column) => {
        db.run(`ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`, (alterErr) => {
          if (alterErr) {
            console.error(`Error adding ${column.name} column:`, alterErr.message);
            return;
          }

          console.log(`Added ${column.name} column to users table.`);
        });
      });

      backfillLegacyNetworkColumns(existingColumnNames);
    });
  });
}

function backfillLegacyNetworkColumns(existingColumnNames = new Set()) {
  if (!existingColumnNames.has('registration_ip')) {
    return;
  }

  db.all('SELECT id, registration_ip, ip4, ip6 FROM users', (err, rows) => {
    if (err) {
      console.error('Error backfilling network columns:', err.message);
      return;
    }

    rows.forEach((row) => {
      const existingIp4 = typeof row.ip4 === 'string' ? row.ip4.trim() : '';
      const existingIp6 = typeof row.ip6 === 'string' ? row.ip6.trim() : '';

      if ((existingIp4 || existingIp6) || !row.registration_ip) {
        return;
      }

      const storedNetwork = getStoredIpColumns(row.registration_ip);

      if (!storedNetwork.ip4 && !storedNetwork.ip6) {
        return;
      }

      db.run(
        'UPDATE users SET ip4 = ?, ip6 = ? WHERE id = ?',
        [storedNetwork.ip4, storedNetwork.ip6, row.id],
        (updateErr) => {
          if (updateErr) {
            console.error(`Error updating network columns for user ${row.id}:`, updateErr.message);
          }
        }
      );
    });
  });
}

function enforceSuspendedNetworkBlock(req, res, next) {
  const network = getClientNetworkDetails(req);

  if (isLoopbackNetwork(network)) {
    next();
    return;
  }

  if (!network.ip4 && !network.ip6) {
    next();
    return;
  }

  const sql = `
    SELECT id
    FROM users
    WHERE suspended = 1
      AND ((? != '' AND ip4 = ?) OR (? != '' AND ip6 = ?))
    LIMIT 1
  `;

  db.get(sql, [network.ip4, network.ip4, network.ip6, network.ip6], (err, suspendedUser) => {
    if (err) {
      console.error('Error checking suspended network:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (suspendedUser) {
      logBackendEvent('request.blocked.suspended_network', {
        path: req.originalUrl,
        ip4: network.ip4,
        ip6: network.ip6,
        userId: suspendedUser.id
      });
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    next();
  });
}

app.use(enforceSuspendedNetworkBlock);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const sql = `
      SELECT id, username, email, suspended
      FROM users
      WHERE id = ?
    `;

    db.get(sql, [user.id], (dbErr, dbUser) => {
      if (dbErr) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!dbUser || dbUser.suspended) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }

      req.user = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email
      };
      next();
    });
  });
};

app.post('/api/auth/register', async (req, res) => {
  const {
    username,
    email,
    password,
    titul,
    question,
    answer,
    cell
  } = req.body;
  const network = getClientNetworkDetails(req);

  if (isLoopbackNetwork(network)) {
    return createUser();
  }

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  function createUser() {
    bcrypt.hash(password, 10).then((hashedPassword) => {
      const activationToken = crypto.randomUUID();

      const sql = `
        INSERT INTO users (
          username,
          email,
          password,
          ip4,
          ip6,
          titul,
          question,
          answer,
          cell,
          agent,
          confirmation_token,
          confirmation_token_created_at,
          confirmed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
      `;

      db.run(
        sql,
        [
          username,
          email,
          hashedPassword,
          network.ip4,
          network.ip6,
          typeof titul === 'string' ? titul.trim() : '',
          typeof question === 'string' ? question.trim() : '',
          typeof answer === 'string' ? answer.trim() : '',
          typeof cell === 'string' ? cell.trim() : '',
          network.agent,
          activationToken
        ],
        function (err) {
          if (err) {
            console.error('Error creating registered user:', err.message);
            if (isDuplicateEntryError(err)) {
              return res.status(409).json({ error: 'Username or email already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
          }

          const activationUrl = `${FRONTEND_BASE_URL}/activate/${activationToken}`;

          sendActivationEmail({ username, email, activationUrl }, (mailError, info) => {
            if (mailError) {
              console.error('Error sending email:', mailError);
              return res.status(201).json({
                message: 'Account created, but the activation email could not be sent. The activation link expires after 30 minutes.',
                activationUrl
              });
            }

            console.log('Activation email sent:', info.messageId);

            return res.status(201).json({
              message: 'Account created. Check your email to activate your account. The link expires after 30 minutes.',
              activationUrl
            });
          });
        }
      );
    }).catch((hashingError) => {
      console.error('Register preparation error:', hashingError);
      return res.status(500).json({ error: 'Server error' });
    });
  }

  createUser();
});

app.post('/api/session/start', (req, res) => {
  const network = getClientNetworkDetails(req);
  const optionalUser = getOptionalAuthenticatedUser(req);
  const sessionId = crypto.randomUUID();
  const startPage = typeof req.body?.startPage === 'string' ? req.body.startPage.trim().slice(0, 255) : '';
  const host = typeof req.headers.host === 'string' ? req.headers.host.trim().slice(0, 32) : '';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].trim().slice(0, 255) : 'unknown';

  const sql = `
    INSERT INTO SessionHandler (
      id,
      ip4,
      ip6,
      counterPage,
      userAgent,
      host,
      startPage,
      userId
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      sessionId,
      network.ip4,
      network.ip6,
      1,
      userAgent,
      host || 'unknown',
      startPage || null,
      optionalUser?.id ?? null
    ],
    function (err) {
      if (err) {
        console.error('Error creating session record:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (optionalUser?.id) {
        scheduleAuthenticatedSessionTimeout(sessionId);
      }

      return res.status(201).json({ message: 'Session started', sessionId });
    }
  );
});

app.post('/api/session/page-view', (req, res) => {
  const network = getClientNetworkDetails(req);
  const optionalUser = getOptionalAuthenticatedUser(req);
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].trim().slice(0, 255) : 'unknown';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const pagePath = typeof req.body?.pagePath === 'string' ? req.body.pagePath.trim().slice(0, 255) : '';
  const networkBanKey = getNetworkBanKey(network, userAgent);

  if (!sessionId) {
    return res.status(400).json({ error: 'Session id is required' });
  }

  const findSql = `
    SELECT id, counterPage, userId, endSess
    FROM SessionHandler
    WHERE id = ?
    LIMIT 1
  `;

  db.get(findSql, [sessionId], (findErr, session) => {
    if (findErr) {
      console.error('Error reading session record:', findErr.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.endSess) {
      return res.status(410).json({ error: 'Session has already ended' });
    }

    const nextCounterPage = Number(session.counterPage || 0) + 1;

    if (!optionalUser && nextCounterPage > GUEST_PAGE_LIMIT) {
      guestBanByNetwork.set(networkBanKey, {
        expiresAt: Date.now() + GUEST_BAN_DURATION_MS
      });
      stopAuthenticatedSessionTimeout(sessionId);

      return db.run(
        'UPDATE SessionHandler SET counterPage = ?, endSess = CURRENT_TIMESTAMP WHERE id = ?',
        [nextCounterPage, sessionId],
        (updateErr) => {
          if (updateErr) {
            console.error('Error closing guest session after page limit:', updateErr.message);
            return res.status(500).json({ error: 'Database error' });
          }

          return res.status(511).json({
            error: 'Network Authentication Required',
            message: 'Guest access is blocked for one hour after more than 100 page reads.'
          });
        }
      );
    }

    const updateSql = `
      UPDATE SessionHandler
      SET counterPage = ?,
          startPage = COALESCE(startPage, ?),
          userId = COALESCE(userId, ?)
      WHERE id = ?
    `;

    db.run(updateSql, [nextCounterPage, pagePath || null, optionalUser?.id ?? null, sessionId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating session page count:', updateErr.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (optionalUser?.id) {
        scheduleAuthenticatedSessionTimeout(sessionId);
      }

      return res.json({ message: 'Page view recorded', counterPage: nextCounterPage });
    });
  });
});

app.get('/api/auth/activate/:activationToken', (req, res) => {
  const { activationToken } = req.params;

  if (!activationToken) {
    return res.status(400).json({ error: 'Activation token is required' });
  }

  const findSql = 'SELECT id, confirmed, confirmation_token_created_at FROM users WHERE confirmation_token = ?';

  db.get(findSql, [activationToken], (findErr, user) => {
    if (findErr) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid activation link' });
    }

    if (user.confirmed) {
      return res.json({ message: 'Account is already activated. You can log in now.' });
    }

    if (isActivationExpired(user.confirmation_token_created_at)) {
      const expireSql = `
        UPDATE users
        SET confirmation_token = NULL,
            confirmation_token_created_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      return db.run(expireSql, [user.id], function (expireErr) {
        if (expireErr) {
          return res.status(500).json({ error: 'Database error' });
        }

        return res.status(400).json({
          error: 'This activation link has expired after 30 minutes. Please request a new activation email.'
        });
      });
    }

    const updateSql = `
      UPDATE users
      SET confirmed = 1,
          confirmation_token = NULL,
          confirmation_token_created_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(updateSql, [user.id], function (updateErr) {
      if (updateErr) {
        return res.status(500).json({ error: 'Database error' });
      }

      return res.json({ message: 'Account activated successfully. You can now log in.' });
    });
  });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    // Decode and verify the Google ID token
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Invalid Google credential format' });
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

    // Verify issuer and audience
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      return res.status(401).json({ error: 'Invalid token issuer' });
    }

    if (googleClientId && payload.aud !== googleClientId) {
      return res.status(401).json({ error: 'Invalid token audience' });
    }

    // Verify expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return res.status(401).json({ error: 'Token has expired' });
    }

    const email = payload.email;
    const name = payload.name || (email ? email.split('@')[0] : 'user');

    if (!email) {
      return res.status(400).json({ error: 'Google account does not have an email address' });
    }

    const network = getClientNetworkDetails(req);

    // Look up existing user by email
    const findUserSql = 'SELECT * FROM users WHERE email = ?';

    db.get(findUserSql, [email], async (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existingUser) {
        if (existingUser.suspended) {
          return res.status(404).json({ error: 'Endpoint not found' });
        }

        // Update last visit
        const loginTimestamp = toMysqlDateTime();
        db.run(
          'UPDATE users SET lastVisit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [loginTimestamp, existingUser.id]
        );

        const token = jwt.sign(
          { id: existingUser.id, username: existingUser.username, email: existingUser.email },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        logBackendEvent('auth.google.login.success', { userId: existingUser.id, email });

        return res.json({
          message: 'Login successful',
          token,
          user: {
              id: existingUser.id,
              username: existingUser.username,
              email: existingUser.email,
              created_at: existingUser.created_at,
              updated_at: toMysqlDateTime(),
              lastVisit: loginTimestamp
            }
          });
      }

      // Create new user (auto-confirmed since Google verified the email)
      const randomPassword = crypto.randomUUID();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const createSql = `
        INSERT INTO users (username, email, password, ip4, ip6, agent, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `;

      db.run(
        createSql,
        [name, email, hashedPassword, network.ip4, network.ip6, network.agent],
        function (createErr) {
          if (createErr) {
            console.error('Error creating Google-authenticated user:', createErr.message);
            if (isDuplicateEntryError(createErr)) {
              return res.status(409).json({ error: 'Username already exists. Please use a different Google account or register manually.' });
            }
            return res.status(500).json({ error: 'Database error' });
          }

          const newUserId = this.lastID;
          const loginTimestamp = toMysqlDateTime();

          const token = jwt.sign(
            { id: newUserId, username: name, email },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          logBackendEvent('auth.google.register.success', { userId: newUserId, email });

          return res.json({
            message: 'Account created and logged in',
            token,
            user: {
              id: newUserId,
              username: name,
              email,
              created_at: loginTimestamp,
              updated_at: loginTimestamp,
              lastVisit: loginTimestamp
            }
          });
        }
      );
    });
  } catch (parseError) {
    logBackendEvent('auth.google.error', { error: parseError.message });
    return res.status(400).json({ error: 'Invalid Google credential' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;

  logBackendEvent('auth.login.attempt', {
    login: maskLoginValue(login),
    hasPassword: typeof password === 'string' && password.length > 0,
    ip: getClientIpAddress(req)
  });

  if (!login || !password) {
    logBackendEvent('auth.login.invalid_request', {
      login: maskLoginValue(login),
      reason: 'missing login or password'
    });
    return res.status(400).json({ error: 'Login and password are required' });
  }

  const sql = 'SELECT * FROM users WHERE email = ? OR username = ?';

  db.get(sql, [login, login], async (err, user) => {
    if (err) {
      logBackendEvent('auth.login.db_error', {
        login: maskLoginValue(login),
        error: err.message
      });
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      logBackendEvent('auth.login.user_not_found', {
        login: maskLoginValue(login)
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.suspended) {
      logBackendEvent('auth.login.suspended_user', {
        login: maskLoginValue(login),
        userId: user.id
      });
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    if (!user.confirmed) {
      logBackendEvent('auth.login.user_unconfirmed', {
        login: maskLoginValue(login),
        userId: user.id
      });
      return res.status(401).json({ error: 'Please activate your email before logging in' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      logBackendEvent('auth.login.password_invalid', {
        login: maskLoginValue(login),
        userId: user.id
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    logBackendEvent('auth.login.success', {
      login: maskLoginValue(login),
      userId: user.id
    });

    const loginTimestamp = toMysqlDateTime();
    const updateLastVisitSql = `
      UPDATE users
      SET lastVisit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(updateLastVisitSql, [loginTimestamp, user.id], (updateErr) => {
      if (updateErr) {
        logBackendEvent('auth.login.last_visit_update_failed', {
          userId: user.id,
          error: updateErr.message,
          attemptedLastVisit: loginTimestamp
        });
        return res.status(500).json({ error: 'Database error' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at,
          updated_at: toMysqlDateTime(),
          lastVisit: loginTimestamp
        }
      });
    });
  });
});

app.get('/api/auth/validate', authenticateToken, (req, res) => {
  const sql = 'SELECT id, username, email, titul, cell, question, answer, lastVisit, suspended, created_at, updated_at FROM users WHERE id = ?';

  db.get(sql, [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  });
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const sql = 'SELECT id, username, email, titul, cell, question, answer, lastVisit, suspended, created_at, updated_at FROM users WHERE id = ?';

  db.get(sql, [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  });
});

app.put('/api/auth/profile', authenticateToken, (req, res) => {
  const getExistingUserSql = `
    SELECT id, username, email, titul, cell, question, answer, lastVisit, suspended, created_at, updated_at
    FROM users
    WHERE id = ?
  `;

  db.get(getExistingUserSql, [req.user.id], (lookupErr, existingUser) => {
    if (lookupErr) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedProfile = normalizeProfileUpdate(req.body, existingUser);
    if (normalizedProfile.error) {
      return res.status(400).json({ error: normalizedProfile.error });
    }

    const updateSql = `
      UPDATE users
      SET username = ?, email = ?, cell = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(
      updateSql,
      [normalizedProfile.username, normalizedProfile.email, normalizedProfile.cell, req.user.id],
      function (updateErr) {
        if (updateErr) {
          console.error('Error updating profile:', updateErr.message);
          if (isDuplicateEntryError(updateErr)) {
            return res.status(409).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        db.get(getExistingUserSql, [req.user.id], (refreshErr, updatedUser) => {
          if (refreshErr) {
            return res.status(500).json({ error: 'Database error' });
          }

          if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
          }

          return res.json({
            user: updatedUser
          });
        });
      }
    );
  });
});

app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const sql = 'SELECT password FROM users WHERE id = ?';

  db.get(sql, [req.user.id], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateSql = `
      UPDATE users
      SET password = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(updateSql, [hashedPassword, req.user.id], function (updateErr) {
      if (updateErr) {
        return res.status(500).json({ error: 'Database error' });
      }

      return res.json({ message: 'Password changed successfully' });
    });
  });
});

app.delete('/api/auth/account', authenticateToken, (req, res) => {
  const sql = 'DELETE FROM users WHERE id = ?';

  db.run(sql, [req.user.id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ message: 'Account deleted successfully' });
  });
});

app.get('/api/global-configuration/counter', (req, res) => {
  const sql = `
    SELECT config_value
    FROM global_configuration
    WHERE config_attribute = ?
    LIMIT 1
  `;

  db.get(sql, ['counter'], (err, row) => {
    if (err) {
      console.error('Error reading visitor counter:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json({
      configAttribute: 'counter',
      configValue: row?.config_value ?? '0'
    });
  });
});

app.get('/access-check', (req, res) => {
  res.status(204).end();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

app.post('/api/auth/resend-activation', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (!email) {
    return res.status(400).json({ error: 'Email is required to resend the activation link' });
  }

  const findSql = `
    SELECT id, username, email, confirmed
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.get(findSql, [email], (findErr, user) => {
    if (findErr) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'No account was found for that email address' });
    }

    if (user.confirmed) {
      return res.status(400).json({ error: 'This account is already activated. You can log in now.' });
    }

    const activationToken = crypto.randomUUID();
    const updateSql = `
      UPDATE users
      SET confirmation_token = ?,
          confirmation_token_created_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(updateSql, [activationToken, user.id], function (updateErr) {
      if (updateErr) {
        return res.status(500).json({ error: 'Database error' });
      }

      const activationUrl = `${FRONTEND_BASE_URL}/activate/${activationToken}`;

      sendActivationEmail({ username: user.username, email: user.email, activationUrl }, (mailError) => {
        if (mailError) {
          console.error('Error resending activation email:', mailError);
          return res.status(500).json({ error: 'Unable to send a new activation email right now. Please try again later.' });
        }

        return res.json({
          message: 'A new activation email has been sent. The new link expires after 30 minutes.'
        });
      });
    });
  });
});

async function initializeDatabase() {
  try {
    console.log(`[backend-init] attempting MySQL connection to ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE} as ${MYSQL_USER}`);
    await pool.query('SELECT 1');
    console.log(`[backend-init] connected to MySQL database ${MYSQL_DATABASE} at ${MYSQL_HOST}:${MYSQL_PORT}`);
    createTables();
    app.listen(PORT, () => {
      console.log(`[backend-init] server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`[backend-init] MySQL connection failed for ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}:`, error.message);
    process.exit(1);
  }
}

initializeDatabase();
