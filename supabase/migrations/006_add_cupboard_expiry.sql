-- Migration: Add expiry date to cupboard items

alter table cupboard_items
add column if not exists expires_on date;
