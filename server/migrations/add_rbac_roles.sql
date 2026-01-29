-- Migration: Add RBAC roles and seed initial users
-- Date: 2026-01-27

-- Step 1: Alter the users table role column to support new ENUM values
ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'OBSERVER';

-- Step 2: Update existing users to new role names (if any exist)
-- REQUESTER -> LAB_MANAGER (can approve + request + distribute)
-- APPROVER -> PROCUREMENT (can order + receive + distribute)
UPDATE users SET role = 'LAB_MANAGER' WHERE role = 'REQUESTER';
UPDATE users SET role = 'PROCUREMENT' WHERE role = 'APPROVER';

-- Step 2: Create initial users if they don't exist
-- Note: Password hashes are bcrypt(10) of the specified passwords

-- Oktay (ADMIN) - password: 250022
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'Oktay', '$2b$10$VxJ5x1k8W6MuvXrbE6LbcuWwg2BcXFHnhbXUGo4qKr11vn0MMQNvS', 'ADMIN', 'system'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'Oktay');

-- Nilgun (LAB_MANAGER) - password: 0000
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'Nilgun', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'LAB_MANAGER', 'Oktay'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'Nilgun');

-- Mehtap (PROCUREMENT) - password: 0000
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'Mehtap', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'PROCUREMENT', 'Oktay'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'Mehtap');

-- user1 (OBSERVER) - password: 0000
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'user1', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'OBSERVER', 'Oktay'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'user1');

-- user2 (OBSERVER) - password: 0000
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'user2', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'OBSERVER', 'Oktay'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'user2');

-- user3 (OBSERVER) - password: 0000
INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'user3', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'OBSERVER', 'Oktay'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'user3');
