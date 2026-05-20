-- 202605200001_admin_growth_dashboard.sql

-- Classify existing seed/test organizations so growth KPIs do not count them
-- as real customer organizations.
update public.organizations
set kind = 'test'
where kind = 'customer';

update public.organizations
set kind = 'demo'
where is_demo = true
   or slug = 'demo';

create table if not exists public.growth_web_analytics_daily (
  day date primary key,
  unique_visitors integer not null default 0,
  demo_unique_visitors integer not null default 0,
  provider text not null default 'umami',
  timezone text not null default 'Europe/Berlin',
  synced_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create or replace view public.admin_growth_dashboard as
with web_30d as (
  select
    coalesce(sum(unique_visitors), 0)::integer as website_visitors_30d,
    coalesce(sum(demo_unique_visitors), 0)::integer as demo_visitors_30d
  from public.growth_web_analytics_daily
  where day >= current_date - interval '30 days'
),

customer_orgs as (
  select
    o.id,
    o.name,
    o.slug,
    o.kind,
    o.created_at
  from public.organizations o
  where o.kind = 'customer'
),

new_customer_accounts_30d as (
  select count(distinct u.id)::integer as value
  from auth.users u
  join public.organization_members om
    on om.user_id = u.id
  join customer_orgs o
    on o.id = om.organization_id
  where om.role = 'owner'
    and u.deleted_at is null
    and u.created_at >= now() - interval '30 days'
),

active_paying_customers as (
  select count(distinct s.organization_id)::integer as value
  from public.organization_subscriptions s
  join customer_orgs o
    on o.id = s.organization_id
  where s.status = 'active'
    and coalesce(s.price_amount_cents, 0) > 0
    and s.billing_provider in ('stripe', 'manual')
),

cancellations_30d as (
  select count(distinct s.organization_id)::integer as value
  from public.organization_subscriptions s
  join customer_orgs o
    on o.id = s.organization_id
  where s.canceled_at >= now() - interval '30 days'
),

scheduled_cancellations as (
  select count(distinct s.organization_id)::integer as value
  from public.organization_subscriptions s
  join customer_orgs o
    on o.id = s.organization_id
  where s.cancel_at_period_end = true
),

account_language as (
  select
    coalesce(p.preferred_language, 'unknown') as language,
    count(distinct u.id)::integer as users
  from auth.users u
  join public.organization_members om
    on om.user_id = u.id
  join customer_orgs o
    on o.id = om.organization_id
  left join public.profiles p
    on p.id = u.id
  where u.deleted_at is null
  group by coalesce(p.preferred_language, 'unknown')
)

select
  w.website_visitors_30d,
  w.demo_visitors_30d,
  case
    when w.website_visitors_30d > 0
      then round((w.demo_visitors_30d::numeric / w.website_visitors_30d::numeric) * 100, 1)
    else 0
  end as demo_conversion_rate_30d,

  (select value from new_customer_accounts_30d) as new_customer_accounts_30d,
  (select value from active_paying_customers) as active_paying_customers,
  (select value from cancellations_30d) as cancellations_30d,
  (select value from scheduled_cancellations) as scheduled_cancellations,

  coalesce(
    (select jsonb_object_agg(language, users) from account_language),
    '{}'::jsonb
  ) as account_language_split
from web_30d w;