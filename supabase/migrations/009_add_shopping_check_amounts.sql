-- Migration: Track purchased amounts for shopping checks

alter table shopping_checks
  add column if not exists bought_amount text,
  add column if not exists added_to_cupboard boolean not null default false;
