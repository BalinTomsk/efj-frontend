CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  ip4 VARCHAR(45),
  ip6 VARCHAR(45),
  titul VARCHAR(255),
  lastVisit DATETIME,
  question TEXT,
  answer TEXT,
  cell VARCHAR(255),
  suspended TINYINT(1) DEFAULT 0,
  agent TEXT,
  confirmed TINYINT(1) DEFAULT 0,
  confirmation_token VARCHAR(255),
  confirmation_token_created_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_unique (username),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS global_configuration (
  config_attribute VARCHAR(50) NOT NULL,
  config_value LONGTEXT NULL,
  global_config_default_value LONGTEXT NULL,
  global_config_user_name VARCHAR(128) NULL,
  global_config_updatedate DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  global_config_type VARCHAR(16) NULL,
  global_configuration_sysflag TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (config_attribute)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO global_configuration (
  config_attribute,
  config_value,
  global_config_default_value,
  global_config_user_name,
  global_config_updatedate,
  global_config_type,
  global_configuration_sysflag
)
VALUES (
  'counter',
  '1',
  '1',
  NULL,
  CURRENT_TIMESTAMP(6),
  'number',
  0
)
ON DUPLICATE KEY UPDATE
  config_value = config_value;

CREATE TABLE IF NOT EXISTS SessionHandler (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ip4 VARCHAR(45),
  ip6 VARCHAR(45),
  startSess DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  endSess DATETIME NULL,
  counterPage BIGINT NULL,
  userAgent VARCHAR(255) NOT NULL,
  host VARCHAR(32) NOT NULL,
  startPage VARCHAR(255) NULL,
  userId INT NULL,
  sid BIGINT NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessionhandler_sid (sid),
  KEY idx_sessionhandler_userId (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
