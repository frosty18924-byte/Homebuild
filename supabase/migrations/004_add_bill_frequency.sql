-- Add frequency column to bills table
ALTER TABLE bills ADD COLUMN frequency text NOT NULL DEFAULT 'monthly';
