-- Migration: Add recipe fields to meal_plans
alter table meal_plans 
add column if not exists recipe text,
add column if not exists ingredients jsonb default '[]'::jsonb,
add column if not exists shopping_tips text;

comment on column meal_plans.recipe is 'Step-by-step cooking instructions';
comment on column meal_plans.ingredients is 'List of ingredients with quantities';
comment on column meal_plans.shopping_tips is 'Specific tips for Asda/Aldi and bulk buying';
