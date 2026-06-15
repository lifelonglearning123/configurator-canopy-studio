// Minimal hand-written Database type matching 0001_init.sql / 0002_rls.sql.
// Replace with `supabase gen types typescript` output when the Supabase CLI
// is wired up to the project.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  logo_url: string | null;
  primary_color: string | null;
  ghl_webhook_url: string | null;
  ghl_location_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type TenantInsert = Partial<TenantRow> & Pick<TenantRow, 'slug' | 'name'>;
type TenantUpdate = Partial<TenantRow>;

type TenantDomainRow = {
  id: string;
  tenant_id: string;
  hostname: string;
  is_primary: boolean;
  verified_at: string | null;
  ssl_status: string;
  vercel_domain_id: string | null;
  created_at: string;
};
type TenantUserRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  created_at: string;
};
type ProductRow = {
  id: string;
  key: string;
  name: string;
  tagline: string | null;
  default_schema_json: Json;
  created_at: string;
};
type TenantProductRow = {
  tenant_id: string;
  product_id: string;
  enabled: boolean;
  custom_name: string | null;
  custom_tagline: string | null;
  sort_order: number;
};
type PricingRuleRow = {
  id: string;
  tenant_id: string;
  product_key: string | null;
  line_item_key: string;
  label: string;
  amount_minor: number;
  enabled: boolean;
  updated_at: string;
};
type LeadRow = {
  id: string;
  tenant_id: string;
  product_key: string | null;
  config_json: Json;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  notes: string | null;
  price_quoted_minor: number;
  currency: string;
  status: string;
  ghl_status: string;
  ghl_response: Json | null;
  ghl_attempts: number;
  source_url: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
};

type R = []; // No declared FK relationships; queries that select related rows still work, just untyped.

export type Database = {
  public: {
    Tables: {
      tenants:         { Row: TenantRow;        Insert: TenantInsert;                                                                Update: TenantUpdate;                  Relationships: R };
      tenant_domains:  { Row: TenantDomainRow;  Insert: Partial<TenantDomainRow> & Pick<TenantDomainRow, 'tenant_id' | 'hostname'>;  Update: Partial<TenantDomainRow>;      Relationships: R };
      tenant_users:    { Row: TenantUserRow;    Insert: Partial<TenantUserRow> & Pick<TenantUserRow, 'user_id' | 'tenant_id'>;       Update: Partial<TenantUserRow>;        Relationships: R };
      products:        { Row: ProductRow;       Insert: Partial<ProductRow> & Pick<ProductRow, 'key' | 'name' | 'default_schema_json'>; Update: Partial<ProductRow>;        Relationships: R };
      tenant_products: { Row: TenantProductRow; Insert: Partial<TenantProductRow> & Pick<TenantProductRow, 'tenant_id' | 'product_id'>; Update: Partial<TenantProductRow>;  Relationships: R };
      pricing_rules:   { Row: PricingRuleRow;   Insert: Partial<PricingRuleRow> & Pick<PricingRuleRow, 'tenant_id' | 'line_item_key' | 'label'>; Update: Partial<PricingRuleRow>; Relationships: R };
      leads:           { Row: LeadRow;          Insert: Partial<LeadRow> & Pick<LeadRow, 'tenant_id' | 'first_name' | 'last_name' | 'email' | 'config_json'>; Update: Partial<LeadRow>; Relationships: R };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
