import { createDatabase } from './index.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const db = createDatabase(config.dbFile);
logger.info('db_migrated', { file: config.dbFile });
db.close();
