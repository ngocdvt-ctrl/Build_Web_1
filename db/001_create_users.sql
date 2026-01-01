CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  verification_token TEXT,
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
