import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { mkdir, writeFile, unlink, rename, access, readdir, rmdir, rm } from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, extname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { notifyNtfy, normalizeTopic, resolveNtfyConfig } from './lib/notifyNtfy.mjs';
// TODO: Import analysis modules when available
// import { reviewWithAI as reviewDocumentWithAI, decideFinalAnalysis, createRegexFallback } from './src/server/analysis/documentPipeline.mjs';
// import { prepareLayoutAnalysisInput } from './src/server/analysis/layoutPipeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ENV ──────────────────────────────────────────────────────────────────────
function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Fehlende ENV-Variable: ${name}`);
  return val;
}

const JWT_SECRET   = requireEnv('JWT_SECRET');
const SMTP_HOST    = requireEnv('SMTP_HOST');
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER    = requireEnv('SMTP_USER');
const SMTP_PASS    = requireEnv('SMTP_PASSWORD');
const SMTP_FROM    = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE  = process.env.SMTP_SECURE === 'true';
const DB_PATH      = process.env.DB_PATH || join(__dirname, 'data/autoarchiv.db');
const STORAGE_PATH = process.env.STORAGE_PATH || join(__dirname, 'storage');
const API_PORT     = parseInt(process.env.API_PORT || '3001', 10);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://nextkm.de';
const ADMIN_MAIK_CLAUDE_DOCX = join(STORAGE_PATH, 'admin', 'autoarchiv-maik-claude-doku.docx');

function getCookieDomain(req) {
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  if (/^localhost:\d+$|^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host)) {
    return undefined; // development / localhost – no domain cookie
  }
  // For production we usually want the domain to be the registered domain (e.g. nextkm.de)
  return host.split('.').slice(-2).join('.'); // e.g. .nextkm.de
}

/* ---------------------------------------------------------------
   1️⃣  Middleware
   --------------------------------------------------------------- */
app.use(cookieParser());
app.use(express.json());

// caching until ready to purge on restart
import {
  readdir,
  rmdir,
  rm,
  existsSync,
} from 'fs/promises'; // rm from promises available here