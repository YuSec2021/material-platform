-- PostgreSQL 17+ schema for the AI Material Management Platform.
--
-- Source: the current SQLAlchemy core tables, column-checked against
-- backend/material_retrieval.db on 2026-07-17.
--
-- This file creates schema objects only. It intentionally excludes SQLite
-- legacy/test tables: _test3, attribute, audit_log_legacy_1778548119, brand, category, category_library, material, material_library, product_name.
-- Apply to an empty database. Existing SQLite data must be cleaned before
-- loading because PostgreSQL enforces the foreign keys declared here.
-- After importing rows with explicit id values, reset every SERIAL sequence
-- to MAX(id) before enabling application writes.

BEGIN;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET TIME ZONE 'UTC';
SET search_path TO public;

CREATE TABLE ai_agent_config (
	id SERIAL NOT NULL,
	config_key VARCHAR(120) NOT NULL,
	provider VARCHAR(80) NOT NULL,
	model_name VARCHAR(180) NOT NULL,
	base_url VARCHAR(320) NOT NULL,
	encrypted_api_key TEXT NOT NULL,
	temperature FLOAT NOT NULL,
	max_tokens INTEGER NOT NULL,
	timeout INTEGER NOT NULL,
	enabled BOOLEAN NOT NULL,
	connection_status VARCHAR(40) NOT NULL,
	last_test_message TEXT NOT NULL,
	last_test_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ai_agent_config_key UNIQUE (config_key)
);

CREATE TABLE ai_capability_prices (
	id SERIAL NOT NULL,
	capability VARCHAR(80) NOT NULL,
	prompt_price_per_1k_cny FLOAT NOT NULL,
	completion_price_per_1k_cny FLOAT NOT NULL,
	currency VARCHAR(12) NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ai_capability_prices_capability UNIQUE (capability)
);

CREATE TABLE ai_prompt_templates (
	id SERIAL NOT NULL,
	template_key VARCHAR(120) NOT NULL,
	capability VARCHAR(80) NOT NULL,
	prompt_version VARCHAR(80) NOT NULL,
	content TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ai_prompt_templates_template_key UNIQUE (template_key)
);

CREATE TABLE audit_log (
	id SERIAL NOT NULL,
	"user" VARCHAR(120) NOT NULL,
	resource VARCHAR(160) NOT NULL,
	action VARCHAR(80) NOT NULL,
	before_value TEXT NOT NULL,
	after_value TEXT NOT NULL,
	timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
	source VARCHAR(40) NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE brands (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	name VARCHAR(160) NOT NULL,
	description TEXT NOT NULL,
	logo_filename VARCHAR(240) NOT NULL,
	logo_content_type VARCHAR(120) NOT NULL,
	logo_data_url TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE category_libraries (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	name VARCHAR(160) NOT NULL,
	description TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	vector_index_enabled BOOLEAN NOT NULL DEFAULT false,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE llm_provider_configs (
	id SERIAL NOT NULL,
	provider VARCHAR(80) NOT NULL,
	model VARCHAR(160) NOT NULL,
	endpoint VARCHAR(240) NOT NULL,
	capabilities TEXT NOT NULL,
	active BOOLEAN NOT NULL,
	connection_status VARCHAR(40) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE model_config (
	id SERIAL NOT NULL,
	display_name VARCHAR(180) NOT NULL,
	provider VARCHAR(80) NOT NULL,
	model_name VARCHAR(180) NOT NULL,
	base_url VARCHAR(320) NOT NULL,
	encrypted_api_key TEXT NOT NULL,
	timeout_seconds INTEGER NOT NULL,
	fallback_model_id INTEGER,
	enabled BOOLEAN NOT NULL,
	connection_status VARCHAR(40) NOT NULL,
	last_test_message TEXT NOT NULL,
	last_test_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(fallback_model_id) REFERENCES model_config (id)
);

CREATE TABLE models (
	id SERIAL NOT NULL,
	display_name VARCHAR(180) NOT NULL,
	provider VARCHAR(80) NOT NULL,
	model_name VARCHAR(180) NOT NULL,
	base_url VARCHAR(320) NOT NULL,
	api_key_encrypted TEXT NOT NULL,
	timeout INTEGER NOT NULL,
	temperature FLOAT,
	max_tokens INTEGER,
	enabled BOOLEAN NOT NULL,
	connection_status VARCHAR(40) NOT NULL,
	last_tested_at TIMESTAMP WITH TIME ZONE,
	migration_data_version VARCHAR(40) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_models_provider_model_name UNIQUE (provider, model_name)
);

CREATE TABLE product_name_code_sequence (
	id SERIAL NOT NULL,
	current_value INTEGER NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE measurement_units (
	id SERIAL NOT NULL,
	code VARCHAR(32) NOT NULL,
	name VARCHAR(80) NOT NULL,
	symbol VARCHAR(32) NOT NULL,
	unit_type VARCHAR(40) NOT NULL,
	description TEXT NOT NULL,
	decimal_places INTEGER NOT NULL,
	enabled BOOLEAN NOT NULL,
	is_system BOOLEAN NOT NULL,
	sort_order INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_measurement_units_decimal_places CHECK (decimal_places >= 0 AND decimal_places <= 12)
);

CREATE TABLE application_versions (
	id SERIAL NOT NULL,
	version VARCHAR(40) NOT NULL,
	title VARCHAR(160) NOT NULL,
	release_notes TEXT NOT NULL,
	status VARCHAR(24) NOT NULL,
	released_at TIMESTAMP WITH TIME ZONE,
	created_by VARCHAR(120) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE product_names (
	id SERIAL NOT NULL,
	name VARCHAR(160) NOT NULL,
	product_name_code VARCHAR(12) NOT NULL,
	status VARCHAR(20) NOT NULL,
	unit VARCHAR(40) NOT NULL,
	unit_id INTEGER,
	category_id INTEGER,
	category VARCHAR(160) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(unit_id) REFERENCES measurement_units (id) ON DELETE RESTRICT,
	FOREIGN KEY(category_id) REFERENCES categories (id) ON DELETE RESTRICT
);

CREATE TABLE role_code_sequence (
	id SERIAL NOT NULL,
	current_value INTEGER NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE roles (
	id SERIAL NOT NULL,
	name VARCHAR(160) NOT NULL,
	code VARCHAR(80) NOT NULL,
	description TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE rule_categories (
	id SERIAL NOT NULL,
	slug VARCHAR(80) NOT NULL,
	display_name_zh VARCHAR(160) NOT NULL,
	display_name_en VARCHAR(160) NOT NULL,
	description_zh TEXT NOT NULL,
	description_en TEXT NOT NULL,
	icon VARCHAR(80) NOT NULL,
	sort_order INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE slow_query_log (
	id SERIAL NOT NULL,
	timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
	duration_ms FLOAT NOT NULL,
	operation VARCHAR(40) NOT NULL,
	statement TEXT NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE system_config (
	id SERIAL NOT NULL,
	key VARCHAR(120) NOT NULL,
	value TEXT NOT NULL,
	updated_by VARCHAR(80) NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE telemetry_web_vitals (
	id SERIAL NOT NULL,
	metric VARCHAR(16) NOT NULL,
	value FLOAT NOT NULL,
	rating VARCHAR(40) NOT NULL,
	client_metric_id VARCHAR(160) NOT NULL,
	navigation_type VARCHAR(80) NOT NULL,
	url TEXT NOT NULL,
	path VARCHAR(500) NOT NULL,
	user_agent TEXT NOT NULL,
	timestamp VARCHAR(80) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE tracer_spans (
	id SERIAL NOT NULL,
	trace_id VARCHAR(80) NOT NULL,
	span_id VARCHAR(80) NOT NULL,
	parent_span_id VARCHAR(80) NOT NULL,
	operation_name VARCHAR(160) NOT NULL,
	span_type VARCHAR(40) NOT NULL,
	capability VARCHAR(80) NOT NULL,
	provider VARCHAR(80) NOT NULL,
	model VARCHAR(180) NOT NULL,
	status VARCHAR(40) NOT NULL,
	start_time TIMESTAMP WITH TIME ZONE NOT NULL,
	end_time TIMESTAMP WITH TIME ZONE,
	duration_ms INTEGER NOT NULL,
	metadata_json TEXT NOT NULL,
	error TEXT NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE users (
	id SERIAL NOT NULL,
	username VARCHAR(120) NOT NULL,
	display_name VARCHAR(160) NOT NULL,
	hcm_id VARCHAR(80) NOT NULL,
	unit VARCHAR(160) NOT NULL,
	department VARCHAR(160) NOT NULL,
	team VARCHAR(160) NOT NULL,
	email VARCHAR(240) NOT NULL,
	account_ownership VARCHAR(40) NOT NULL,
	status VARCHAR(40) NOT NULL,
	password_reset_token VARCHAR(120) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE workflow_applications (
	id SERIAL NOT NULL,
	application_no VARCHAR(64) NOT NULL,
	type VARCHAR(40) NOT NULL,
	status VARCHAR(64) NOT NULL,
	applicant VARCHAR(120) NOT NULL,
	current_node VARCHAR(80) NOT NULL,
	business_reason TEXT NOT NULL,
	rejection_reason TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_resource_type VARCHAR(40) NOT NULL,
	created_resource_id INTEGER,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE attributes (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	product_name_id INTEGER NOT NULL,
	name VARCHAR(160) NOT NULL,
	data_type VARCHAR(40) NOT NULL,
	unit VARCHAR(80) NOT NULL,
	unit_id INTEGER,
	brand_id INTEGER,
	required BOOLEAN NOT NULL,
	default_value VARCHAR(240) NOT NULL,
	options TEXT NOT NULL,
	description TEXT NOT NULL,
	source VARCHAR(160) NOT NULL,
	version INTEGER NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(product_name_id) REFERENCES product_names (id),
	FOREIGN KEY(unit_id) REFERENCES measurement_units (id) ON DELETE RESTRICT,
	FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE RESTRICT
);

CREATE TABLE capability_agent_mapping (
	id SERIAL NOT NULL,
	capability VARCHAR(80) NOT NULL,
	agent_config_id INTEGER NOT NULL,
	fallback_agent_config_id INTEGER,
	enabled BOOLEAN NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_capability_agent_mapping UNIQUE (capability),
	FOREIGN KEY(agent_config_id) REFERENCES ai_agent_config (id),
	FOREIGN KEY(fallback_agent_config_id) REFERENCES ai_agent_config (id)
);

CREATE TABLE capability_mappings (
	id SERIAL NOT NULL,
	capability VARCHAR(50) NOT NULL,
	primary_model_id INTEGER,
	fallback_model_id INTEGER,
	enabled BOOLEAN NOT NULL,
	migration_data_version VARCHAR(40) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_capability_mappings_capability UNIQUE (capability),
	CONSTRAINT ck_capability_mappings_distinct_models CHECK (primary_model_id IS NULL OR fallback_model_id IS NULL OR primary_model_id != fallback_model_id),
	FOREIGN KEY(primary_model_id) REFERENCES models (id),
	FOREIGN KEY(fallback_model_id) REFERENCES models (id)
);

CREATE TABLE capability_model_mapping (
	id SERIAL NOT NULL,
	capability VARCHAR(80) NOT NULL,
	primary_model_id INTEGER NOT NULL,
	fallback_model_id INTEGER,
	enabled BOOLEAN NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_capability_model_mapping UNIQUE (capability),
	FOREIGN KEY(primary_model_id) REFERENCES model_config (id),
	FOREIGN KEY(fallback_model_id) REFERENCES model_config (id)
);

CREATE TABLE categories (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	name VARCHAR(160) NOT NULL,
	category_library_id INTEGER,
	parent_category_id INTEGER,
	description TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(category_library_id) REFERENCES category_libraries (id),
	FOREIGN KEY(parent_category_id) REFERENCES categories (id)
);

CREATE TABLE feature_permissions (
	id SERIAL NOT NULL,
	role_id INTEGER NOT NULL,
	module VARCHAR(80) NOT NULL,
	permission_type VARCHAR(40) NOT NULL,
	permission_key VARCHAR(160) NOT NULL,
	label VARCHAR(240) NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_role_permission_key UNIQUE (role_id, permission_key),
	FOREIGN KEY(role_id) REFERENCES roles (id)
);

CREATE TABLE material_libraries (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	name VARCHAR(160) NOT NULL,
	description TEXT NOT NULL,
	enabled BOOLEAN NOT NULL,
	auto_code_enabled BOOLEAN NOT NULL,
	recode_enabled BOOLEAN NOT NULL,
	current_rule_version_id INTEGER,
	material_library_admin_id INTEGER,
	category_library_id INTEGER,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(material_library_admin_id) REFERENCES roles (id),
	FOREIGN KEY(category_library_id) REFERENCES category_libraries (id)
);

CREATE TABLE role_users (
	id SERIAL NOT NULL,
	role_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_role_user_binding UNIQUE (role_id, user_id),
	FOREIGN KEY(role_id) REFERENCES roles (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE rules (
	id SERIAL NOT NULL,
	category_id INTEGER NOT NULL,
	name VARCHAR(180) NOT NULL,
	description TEXT NOT NULL,
	pattern TEXT NOT NULL,
	value TEXT NOT NULL,
	options TEXT NOT NULL,
	priority INTEGER NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(category_id) REFERENCES rule_categories (id)
);

CREATE TABLE workflow_history (
	id SERIAL NOT NULL,
	application_id INTEGER NOT NULL,
	actor VARCHAR(120) NOT NULL,
	node VARCHAR(80) NOT NULL,
	action VARCHAR(40) NOT NULL,
	from_status VARCHAR(64) NOT NULL,
	to_status VARCHAR(64) NOT NULL,
	comment TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(application_id) REFERENCES workflow_applications (id)
);

CREATE TABLE attribute_changes (
	id SERIAL NOT NULL,
	attribute_id INTEGER NOT NULL,
	attribute_code VARCHAR(64) NOT NULL,
	attribute_name VARCHAR(160) NOT NULL,
	version INTEGER NOT NULL,
	operator VARCHAR(80) NOT NULL,
	changed_fields TEXT NOT NULL,
	before_values TEXT NOT NULL,
	after_values TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(attribute_id) REFERENCES attributes (id)
);

CREATE TABLE category_attributes (
	id SERIAL NOT NULL,
	category_id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	display_name_zh VARCHAR(160) NOT NULL,
	display_name_en VARCHAR(160) NOT NULL,
	attr_type VARCHAR(24) NOT NULL,
	options TEXT NOT NULL,
	required BOOLEAN NOT NULL,
	allow_empty BOOLEAN NOT NULL,
	default_value TEXT,
	sort_order INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_category_attribute_name UNIQUE (category_id, name),
	FOREIGN KEY(category_id) REFERENCES categories (id) ON DELETE CASCADE
);

CREATE TABLE material_code_rule_versions (
	id SERIAL NOT NULL,
	library_id INTEGER NOT NULL,
	version_no INTEGER NOT NULL,
	rule_name VARCHAR(180) NOT NULL,
	rule_config TEXT NOT NULL,
	status VARCHAR(40) NOT NULL,
	change_reason TEXT NOT NULL,
	created_by VARCHAR(80) NOT NULL,
	effective_time TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(library_id) REFERENCES material_libraries (id)
);

CREATE TABLE material_library_admin_roles (
	material_library_id INTEGER NOT NULL,
	role_id INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (material_library_id, role_id),
	FOREIGN KEY(material_library_id) REFERENCES material_libraries (id) ON DELETE CASCADE,
	FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE material_library_category_libraries (
	material_library_id INTEGER NOT NULL,
	category_library_id INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (material_library_id, category_library_id),
	FOREIGN KEY(material_library_id) REFERENCES material_libraries (id) ON DELETE CASCADE,
	FOREIGN KEY(category_library_id) REFERENCES category_libraries (id) ON DELETE CASCADE
);

CREATE TABLE material_code_change_batches (
	id SERIAL NOT NULL,
	library_id INTEGER NOT NULL,
	old_rule_version_id INTEGER,
	new_rule_version_id INTEGER,
	change_mode VARCHAR(40) NOT NULL,
	total_count INTEGER NOT NULL,
	success_count INTEGER NOT NULL,
	failed_count INTEGER NOT NULL,
	status VARCHAR(40) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(library_id) REFERENCES material_libraries (id),
	FOREIGN KEY(old_rule_version_id) REFERENCES material_code_rule_versions (id),
	FOREIGN KEY(new_rule_version_id) REFERENCES material_code_rule_versions (id)
);

CREATE TABLE material_code_serials (
	id SERIAL NOT NULL,
	library_id INTEGER NOT NULL,
	rule_version_id INTEGER NOT NULL,
	scope_key VARCHAR(240) NOT NULL,
	current_value INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_material_code_serial_scope UNIQUE (library_id, rule_version_id, scope_key),
	FOREIGN KEY(library_id) REFERENCES material_libraries (id),
	FOREIGN KEY(rule_version_id) REFERENCES material_code_rule_versions (id)
);

CREATE TABLE materials (
	id SERIAL NOT NULL,
	code VARCHAR(64) NOT NULL,
	name VARCHAR(180) NOT NULL,
	product_name_id INTEGER NOT NULL,
	material_library_id INTEGER NOT NULL,
	category_id INTEGER NOT NULL,
	unit VARCHAR(40) NOT NULL,
	unit_id INTEGER,
	brand_id INTEGER,
	status VARCHAR(40) NOT NULL,
	description TEXT NOT NULL,
	attributes TEXT NOT NULL,
	original_code VARCHAR(64) NOT NULL,
	previous_code VARCHAR(64) NOT NULL,
	code_rule_version_id INTEGER,
	code_change_count INTEGER NOT NULL,
	code_status VARCHAR(40) NOT NULL,
	enabled BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_material_product_name UNIQUE (product_name_id, name),
	FOREIGN KEY(product_name_id) REFERENCES product_names (id),
	FOREIGN KEY(material_library_id) REFERENCES material_libraries (id),
	FOREIGN KEY(category_id) REFERENCES categories (id),
	FOREIGN KEY(unit_id) REFERENCES measurement_units (id) ON DELETE RESTRICT,
	FOREIGN KEY(brand_id) REFERENCES brands (id),
	FOREIGN KEY(code_rule_version_id) REFERENCES material_code_rule_versions (id)
);

CREATE TABLE material_code_change_details (
	id SERIAL NOT NULL,
	batch_id INTEGER NOT NULL,
	material_id INTEGER NOT NULL,
	old_code VARCHAR(64) NOT NULL,
	new_code VARCHAR(64) NOT NULL,
	status VARCHAR(40) NOT NULL,
	error_message TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(batch_id) REFERENCES material_code_change_batches (id),
	FOREIGN KEY(material_id) REFERENCES materials (id)
);

CREATE TABLE material_code_mappings (
	id SERIAL NOT NULL,
	library_id INTEGER NOT NULL,
	material_id INTEGER NOT NULL,
	old_code VARCHAR(64) NOT NULL,
	new_code VARCHAR(64) NOT NULL,
	old_rule_version_id INTEGER,
	new_rule_version_id INTEGER,
	batch_id INTEGER,
	status VARCHAR(40) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(library_id) REFERENCES material_libraries (id),
	FOREIGN KEY(material_id) REFERENCES materials (id),
	FOREIGN KEY(old_rule_version_id) REFERENCES material_code_rule_versions (id),
	FOREIGN KEY(new_rule_version_id) REFERENCES material_code_rule_versions (id),
	FOREIGN KEY(batch_id) REFERENCES material_code_change_batches (id)
);

-- Indexes

CREATE INDEX ix_ai_agent_config_config_key ON ai_agent_config (config_key);

CREATE INDEX ix_ai_agent_config_connection_status ON ai_agent_config (connection_status);

CREATE INDEX ix_ai_agent_config_enabled ON ai_agent_config (enabled);

CREATE INDEX ix_ai_agent_config_id ON ai_agent_config (id);

CREATE INDEX ix_ai_agent_config_model_name ON ai_agent_config (model_name);

CREATE INDEX ix_ai_agent_config_provider ON ai_agent_config (provider);

CREATE INDEX ix_ai_capability_prices_capability ON ai_capability_prices (capability);

CREATE INDEX ix_ai_capability_prices_enabled ON ai_capability_prices (enabled);

CREATE INDEX ix_ai_capability_prices_id ON ai_capability_prices (id);

CREATE INDEX ix_ai_prompt_templates_capability ON ai_prompt_templates (capability);

CREATE INDEX ix_ai_prompt_templates_capability_enabled ON ai_prompt_templates (capability, enabled);

CREATE INDEX ix_ai_prompt_templates_enabled ON ai_prompt_templates (enabled);

CREATE INDEX ix_ai_prompt_templates_id ON ai_prompt_templates (id);

CREATE INDEX ix_ai_prompt_templates_prompt_version ON ai_prompt_templates (prompt_version);

CREATE INDEX ix_ai_prompt_templates_template_key ON ai_prompt_templates (template_key);

CREATE INDEX ix_audit_log_action ON audit_log (action);

CREATE INDEX ix_audit_log_id ON audit_log (id);

CREATE INDEX ix_audit_log_resource ON audit_log (resource);

CREATE INDEX ix_audit_log_source ON audit_log (source);

CREATE INDEX ix_audit_log_timestamp ON audit_log (timestamp);

CREATE INDEX ix_audit_log_user ON audit_log ("user");

CREATE UNIQUE INDEX ix_brands_code ON brands (code);

CREATE INDEX ix_brands_id ON brands (id);

CREATE UNIQUE INDEX ix_brands_name ON brands (name);

CREATE UNIQUE INDEX ix_category_libraries_code ON category_libraries (code);

CREATE INDEX ix_category_libraries_id ON category_libraries (id);

CREATE UNIQUE INDEX ix_category_libraries_name ON category_libraries (name);

CREATE INDEX ix_llm_provider_configs_active ON llm_provider_configs (active);

CREATE INDEX ix_llm_provider_configs_id ON llm_provider_configs (id);

CREATE INDEX ix_llm_provider_configs_model ON llm_provider_configs (model);

CREATE INDEX ix_llm_provider_configs_provider ON llm_provider_configs (provider);

CREATE INDEX ix_model_config_connection_status ON model_config (connection_status);

CREATE UNIQUE INDEX ix_model_config_display_name ON model_config (display_name);

CREATE INDEX ix_model_config_enabled ON model_config (enabled);

CREATE INDEX ix_model_config_fallback_model_id ON model_config (fallback_model_id);

CREATE INDEX ix_model_config_id ON model_config (id);

CREATE INDEX ix_model_config_model_name ON model_config (model_name);

CREATE INDEX ix_model_config_provider ON model_config (provider);

CREATE INDEX ix_models_connection_status ON models (connection_status);

CREATE INDEX ix_models_display_name ON models (display_name);

CREATE INDEX ix_models_enabled ON models (enabled);

CREATE INDEX ix_models_id ON models (id);

CREATE INDEX ix_models_migration_data_version ON models (migration_data_version);

CREATE INDEX ix_models_model_name ON models (model_name);

CREATE INDEX ix_models_provider ON models (provider);

CREATE INDEX ix_models_provider_model_name ON models (provider, model_name);

CREATE UNIQUE INDEX ix_measurement_units_code ON measurement_units (code);

CREATE UNIQUE INDEX uq_measurement_units_name_ci ON measurement_units (lower(name));

CREATE INDEX ix_measurement_units_enabled ON measurement_units (enabled);

CREATE INDEX ix_measurement_units_unit_type ON measurement_units (unit_type);

CREATE UNIQUE INDEX ix_application_versions_version ON application_versions (version);

CREATE INDEX ix_application_versions_status ON application_versions (status);

CREATE INDEX ix_product_names_unit_id ON product_names (unit_id);

CREATE INDEX ix_product_names_category_id ON product_names (category_id);

CREATE INDEX ix_product_names_id ON product_names (id);

CREATE UNIQUE INDEX ix_product_names_name ON product_names (name);

CREATE UNIQUE INDEX ix_product_names_product_name_code ON product_names (product_name_code);

CREATE INDEX ix_product_names_status ON product_names (status);

CREATE UNIQUE INDEX ix_roles_code ON roles (code);

CREATE INDEX ix_roles_enabled ON roles (enabled);

CREATE INDEX ix_roles_id ON roles (id);

CREATE UNIQUE INDEX ix_roles_name ON roles (name);

CREATE INDEX ix_rule_categories_id ON rule_categories (id);

CREATE UNIQUE INDEX ix_rule_categories_slug ON rule_categories (slug);

CREATE INDEX ix_rule_categories_sort_order ON rule_categories (sort_order);

CREATE INDEX ix_slow_query_log_duration_ms ON slow_query_log (duration_ms);

CREATE INDEX ix_slow_query_log_id ON slow_query_log (id);

CREATE INDEX ix_slow_query_log_operation ON slow_query_log (operation);

CREATE INDEX ix_slow_query_log_timestamp ON slow_query_log (timestamp);

CREATE INDEX ix_system_config_id ON system_config (id);

CREATE UNIQUE INDEX ix_system_config_key ON system_config (key);

CREATE INDEX ix_telemetry_web_vitals_client_metric_id ON telemetry_web_vitals (client_metric_id);

CREATE INDEX ix_telemetry_web_vitals_created_at ON telemetry_web_vitals (created_at);

CREATE INDEX ix_telemetry_web_vitals_id ON telemetry_web_vitals (id);

CREATE INDEX ix_telemetry_web_vitals_metric ON telemetry_web_vitals (metric);

CREATE INDEX ix_telemetry_web_vitals_path ON telemetry_web_vitals (path);

CREATE INDEX ix_telemetry_web_vitals_timestamp ON telemetry_web_vitals (timestamp);

CREATE INDEX ix_tracer_spans_capability ON tracer_spans (capability);

CREATE INDEX ix_tracer_spans_id ON tracer_spans (id);

CREATE INDEX ix_tracer_spans_model ON tracer_spans (model);

CREATE INDEX ix_tracer_spans_operation_name ON tracer_spans (operation_name);

CREATE INDEX ix_tracer_spans_parent_span_id ON tracer_spans (parent_span_id);

CREATE INDEX ix_tracer_spans_provider ON tracer_spans (provider);

CREATE UNIQUE INDEX ix_tracer_spans_span_id ON tracer_spans (span_id);

CREATE INDEX ix_tracer_spans_span_type ON tracer_spans (span_type);

CREATE INDEX ix_tracer_spans_start_time ON tracer_spans (start_time);

CREATE INDEX ix_tracer_spans_status ON tracer_spans (status);

CREATE INDEX ix_tracer_spans_trace_id ON tracer_spans (trace_id);

CREATE INDEX ix_users_account_ownership ON users (account_ownership);

CREATE INDEX ix_users_department ON users (department);

CREATE INDEX ix_users_display_name ON users (display_name);

CREATE INDEX ix_users_hcm_id ON users (hcm_id);

CREATE INDEX ix_users_id ON users (id);

CREATE INDEX ix_users_status ON users (status);

CREATE INDEX ix_users_team ON users (team);

CREATE INDEX ix_users_unit ON users (unit);

CREATE UNIQUE INDEX ix_users_username ON users (username);

CREATE INDEX ix_workflow_applications_applicant ON workflow_applications (applicant);

CREATE UNIQUE INDEX ix_workflow_applications_application_no ON workflow_applications (application_no);

CREATE INDEX ix_workflow_applications_id ON workflow_applications (id);

CREATE INDEX ix_workflow_applications_status ON workflow_applications (status);

CREATE INDEX ix_workflow_applications_type ON workflow_applications (type);

CREATE UNIQUE INDEX ix_attributes_code ON attributes (code);

CREATE INDEX ix_attributes_id ON attributes (id);

CREATE INDEX ix_attributes_name ON attributes (name);

CREATE INDEX ix_attributes_product_name_id ON attributes (product_name_id);

CREATE INDEX ix_capability_agent_mapping_agent_config_id ON capability_agent_mapping (agent_config_id);

CREATE INDEX ix_capability_agent_mapping_capability ON capability_agent_mapping (capability);

CREATE INDEX ix_capability_agent_mapping_enabled ON capability_agent_mapping (enabled);

CREATE INDEX ix_capability_agent_mapping_fallback_agent_config_id ON capability_agent_mapping (fallback_agent_config_id);

CREATE INDEX ix_capability_agent_mapping_id ON capability_agent_mapping (id);

CREATE INDEX ix_capability_mappings_capability ON capability_mappings (capability);

CREATE INDEX ix_capability_mappings_enabled ON capability_mappings (enabled);

CREATE INDEX ix_capability_mappings_fallback_model_id ON capability_mappings (fallback_model_id);

CREATE INDEX ix_capability_mappings_id ON capability_mappings (id);

CREATE INDEX ix_capability_mappings_migration_data_version ON capability_mappings (migration_data_version);

CREATE INDEX ix_capability_mappings_primary_model_id ON capability_mappings (primary_model_id);

CREATE INDEX ix_capability_model_mapping_capability ON capability_model_mapping (capability);

CREATE INDEX ix_capability_model_mapping_enabled ON capability_model_mapping (enabled);

CREATE INDEX ix_capability_model_mapping_fallback_model_id ON capability_model_mapping (fallback_model_id);

CREATE INDEX ix_capability_model_mapping_id ON capability_model_mapping (id);

CREATE INDEX ix_capability_model_mapping_primary_model_id ON capability_model_mapping (primary_model_id);

CREATE INDEX ix_categories_category_library_id ON categories (category_library_id);

CREATE UNIQUE INDEX ix_categories_code ON categories (code);

CREATE INDEX ix_categories_id ON categories (id);

CREATE INDEX ix_categories_name ON categories (name);

CREATE INDEX ix_categories_parent_category_id ON categories (parent_category_id);

CREATE INDEX ix_attributes_unit_id ON attributes (unit_id);

CREATE INDEX ix_attributes_brand_id ON attributes (brand_id);

CREATE INDEX ix_feature_permissions_id ON feature_permissions (id);

CREATE INDEX ix_feature_permissions_module ON feature_permissions (module);

CREATE INDEX ix_feature_permissions_permission_key ON feature_permissions (permission_key);

CREATE INDEX ix_feature_permissions_permission_type ON feature_permissions (permission_type);

CREATE INDEX ix_feature_permissions_role_id ON feature_permissions (role_id);

CREATE INDEX ix_material_libraries_category_library_id ON material_libraries (category_library_id);

CREATE UNIQUE INDEX ix_material_libraries_code ON material_libraries (code);

CREATE INDEX ix_material_libraries_current_rule_version_id ON material_libraries (current_rule_version_id);

CREATE INDEX ix_material_libraries_id ON material_libraries (id);

CREATE INDEX ix_material_libraries_material_library_admin_id ON material_libraries (material_library_admin_id);

CREATE INDEX ix_materials_unit_id ON materials (unit_id);

CREATE UNIQUE INDEX ix_material_libraries_name ON material_libraries (name);

CREATE INDEX ix_role_users_id ON role_users (id);

CREATE INDEX ix_role_users_role_id ON role_users (role_id);

CREATE INDEX ix_role_users_user_id ON role_users (user_id);

CREATE INDEX ix_rules_category_id ON rules (category_id);

CREATE INDEX ix_rules_enabled ON rules (enabled);

CREATE INDEX ix_rules_id ON rules (id);

CREATE INDEX ix_rules_name ON rules (name);

CREATE INDEX ix_rules_priority ON rules (priority);

CREATE INDEX ix_workflow_history_action ON workflow_history (action);

CREATE INDEX ix_workflow_history_application_id ON workflow_history (application_id);

CREATE INDEX ix_workflow_history_id ON workflow_history (id);

CREATE INDEX ix_attribute_changes_attribute_code ON attribute_changes (attribute_code);

CREATE INDEX ix_attribute_changes_attribute_id ON attribute_changes (attribute_id);

CREATE INDEX ix_attribute_changes_attribute_name ON attribute_changes (attribute_name);

CREATE INDEX ix_attribute_changes_id ON attribute_changes (id);

CREATE INDEX ix_category_attributes_attr_type ON category_attributes (attr_type);

CREATE INDEX ix_category_attributes_category_id ON category_attributes (category_id);

CREATE INDEX ix_category_attributes_id ON category_attributes (id);

CREATE INDEX ix_category_attributes_name ON category_attributes (name);

CREATE INDEX ix_material_code_rule_versions_id ON material_code_rule_versions (id);

CREATE INDEX ix_material_code_rule_versions_library_id ON material_code_rule_versions (library_id);

CREATE INDEX ix_material_code_rule_versions_status ON material_code_rule_versions (status);

CREATE INDEX ix_material_code_rule_versions_version_no ON material_code_rule_versions (version_no);

CREATE INDEX ix_material_code_change_batches_id ON material_code_change_batches (id);

CREATE INDEX ix_material_code_change_batches_library_id ON material_code_change_batches (library_id);

CREATE INDEX ix_material_code_change_batches_status ON material_code_change_batches (status);

CREATE INDEX ix_material_code_serials_id ON material_code_serials (id);

CREATE INDEX ix_material_code_serials_library_id ON material_code_serials (library_id);

CREATE INDEX ix_material_code_serials_rule_version_id ON material_code_serials (rule_version_id);

CREATE INDEX ix_material_code_serials_scope_key ON material_code_serials (scope_key);

CREATE INDEX ix_materials_brand_id ON materials (brand_id);

CREATE INDEX ix_materials_category_id ON materials (category_id);

CREATE UNIQUE INDEX ix_materials_code ON materials (code);

CREATE INDEX ix_materials_code_rule_version_id ON materials (code_rule_version_id);

CREATE INDEX ix_materials_code_status ON materials (code_status);

CREATE INDEX ix_materials_id ON materials (id);

CREATE INDEX ix_materials_material_library_id ON materials (material_library_id);

CREATE INDEX ix_materials_name ON materials (name);

CREATE INDEX ix_materials_product_name_id ON materials (product_name_id);

CREATE INDEX ix_materials_status ON materials (status);

CREATE INDEX ix_material_code_change_details_batch_id ON material_code_change_details (batch_id);

CREATE INDEX ix_material_code_change_details_id ON material_code_change_details (id);

CREATE INDEX ix_material_code_change_details_material_id ON material_code_change_details (material_id);

CREATE INDEX ix_material_code_change_details_status ON material_code_change_details (status);

CREATE INDEX ix_material_code_mappings_id ON material_code_mappings (id);

CREATE INDEX ix_material_code_mappings_library_id ON material_code_mappings (library_id);

CREATE INDEX ix_material_code_mappings_material_id ON material_code_mappings (material_id);

CREATE INDEX ix_material_code_mappings_status ON material_code_mappings (status);

COMMIT;

-- Post-import sequence synchronization template:
-- SELECT setval(pg_get_serial_sequence('public.ai_agent_config', 'id'), COALESCE((SELECT MAX(id) FROM public.ai_agent_config), 1), (SELECT COUNT(*) > 0 FROM public.ai_agent_config));
-- SELECT setval(pg_get_serial_sequence('public.ai_capability_prices', 'id'), COALESCE((SELECT MAX(id) FROM public.ai_capability_prices), 1), (SELECT COUNT(*) > 0 FROM public.ai_capability_prices));
-- SELECT setval(pg_get_serial_sequence('public.ai_prompt_templates', 'id'), COALESCE((SELECT MAX(id) FROM public.ai_prompt_templates), 1), (SELECT COUNT(*) > 0 FROM public.ai_prompt_templates));
-- SELECT setval(pg_get_serial_sequence('public.audit_log', 'id'), COALESCE((SELECT MAX(id) FROM public.audit_log), 1), (SELECT COUNT(*) > 0 FROM public.audit_log));
-- SELECT setval(pg_get_serial_sequence('public.brands', 'id'), COALESCE((SELECT MAX(id) FROM public.brands), 1), (SELECT COUNT(*) > 0 FROM public.brands));
-- SELECT setval(pg_get_serial_sequence('public.category_libraries', 'id'), COALESCE((SELECT MAX(id) FROM public.category_libraries), 1), (SELECT COUNT(*) > 0 FROM public.category_libraries));
-- SELECT setval(pg_get_serial_sequence('public.llm_provider_configs', 'id'), COALESCE((SELECT MAX(id) FROM public.llm_provider_configs), 1), (SELECT COUNT(*) > 0 FROM public.llm_provider_configs));
-- SELECT setval(pg_get_serial_sequence('public.model_config', 'id'), COALESCE((SELECT MAX(id) FROM public.model_config), 1), (SELECT COUNT(*) > 0 FROM public.model_config));
-- SELECT setval(pg_get_serial_sequence('public.models', 'id'), COALESCE((SELECT MAX(id) FROM public.models), 1), (SELECT COUNT(*) > 0 FROM public.models));
-- SELECT setval(pg_get_serial_sequence('public.product_name_code_sequence', 'id'), COALESCE((SELECT MAX(id) FROM public.product_name_code_sequence), 1), (SELECT COUNT(*) > 0 FROM public.product_name_code_sequence));
-- SELECT setval(pg_get_serial_sequence('public.application_versions', 'id'), COALESCE((SELECT MAX(id) FROM public.application_versions), 1), (SELECT COUNT(*) > 0 FROM public.application_versions));
-- SELECT setval(pg_get_serial_sequence('public.product_names', 'id'), COALESCE((SELECT MAX(id) FROM public.product_names), 1), (SELECT COUNT(*) > 0 FROM public.product_names));
-- SELECT setval(pg_get_serial_sequence('public.role_code_sequence', 'id'), COALESCE((SELECT MAX(id) FROM public.role_code_sequence), 1), (SELECT COUNT(*) > 0 FROM public.role_code_sequence));
-- SELECT setval(pg_get_serial_sequence('public.roles', 'id'), COALESCE((SELECT MAX(id) FROM public.roles), 1), (SELECT COUNT(*) > 0 FROM public.roles));
-- SELECT setval(pg_get_serial_sequence('public.rule_categories', 'id'), COALESCE((SELECT MAX(id) FROM public.rule_categories), 1), (SELECT COUNT(*) > 0 FROM public.rule_categories));
-- SELECT setval(pg_get_serial_sequence('public.slow_query_log', 'id'), COALESCE((SELECT MAX(id) FROM public.slow_query_log), 1), (SELECT COUNT(*) > 0 FROM public.slow_query_log));
-- SELECT setval(pg_get_serial_sequence('public.system_config', 'id'), COALESCE((SELECT MAX(id) FROM public.system_config), 1), (SELECT COUNT(*) > 0 FROM public.system_config));
-- SELECT setval(pg_get_serial_sequence('public.telemetry_web_vitals', 'id'), COALESCE((SELECT MAX(id) FROM public.telemetry_web_vitals), 1), (SELECT COUNT(*) > 0 FROM public.telemetry_web_vitals));
-- SELECT setval(pg_get_serial_sequence('public.tracer_spans', 'id'), COALESCE((SELECT MAX(id) FROM public.tracer_spans), 1), (SELECT COUNT(*) > 0 FROM public.tracer_spans));
-- SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX(id) FROM public.users), 1), (SELECT COUNT(*) > 0 FROM public.users));
-- SELECT setval(pg_get_serial_sequence('public.workflow_applications', 'id'), COALESCE((SELECT MAX(id) FROM public.workflow_applications), 1), (SELECT COUNT(*) > 0 FROM public.workflow_applications));
-- SELECT setval(pg_get_serial_sequence('public.attributes', 'id'), COALESCE((SELECT MAX(id) FROM public.attributes), 1), (SELECT COUNT(*) > 0 FROM public.attributes));
-- SELECT setval(pg_get_serial_sequence('public.capability_agent_mapping', 'id'), COALESCE((SELECT MAX(id) FROM public.capability_agent_mapping), 1), (SELECT COUNT(*) > 0 FROM public.capability_agent_mapping));
-- SELECT setval(pg_get_serial_sequence('public.capability_mappings', 'id'), COALESCE((SELECT MAX(id) FROM public.capability_mappings), 1), (SELECT COUNT(*) > 0 FROM public.capability_mappings));
-- SELECT setval(pg_get_serial_sequence('public.capability_model_mapping', 'id'), COALESCE((SELECT MAX(id) FROM public.capability_model_mapping), 1), (SELECT COUNT(*) > 0 FROM public.capability_model_mapping));
-- SELECT setval(pg_get_serial_sequence('public.categories', 'id'), COALESCE((SELECT MAX(id) FROM public.categories), 1), (SELECT COUNT(*) > 0 FROM public.categories));
-- SELECT setval(pg_get_serial_sequence('public.feature_permissions', 'id'), COALESCE((SELECT MAX(id) FROM public.feature_permissions), 1), (SELECT COUNT(*) > 0 FROM public.feature_permissions));
-- SELECT setval(pg_get_serial_sequence('public.material_libraries', 'id'), COALESCE((SELECT MAX(id) FROM public.material_libraries), 1), (SELECT COUNT(*) > 0 FROM public.material_libraries));
-- SELECT setval(pg_get_serial_sequence('public.role_users', 'id'), COALESCE((SELECT MAX(id) FROM public.role_users), 1), (SELECT COUNT(*) > 0 FROM public.role_users));
-- SELECT setval(pg_get_serial_sequence('public.rules', 'id'), COALESCE((SELECT MAX(id) FROM public.rules), 1), (SELECT COUNT(*) > 0 FROM public.rules));
-- SELECT setval(pg_get_serial_sequence('public.workflow_history', 'id'), COALESCE((SELECT MAX(id) FROM public.workflow_history), 1), (SELECT COUNT(*) > 0 FROM public.workflow_history));
-- SELECT setval(pg_get_serial_sequence('public.attribute_changes', 'id'), COALESCE((SELECT MAX(id) FROM public.attribute_changes), 1), (SELECT COUNT(*) > 0 FROM public.attribute_changes));
-- SELECT setval(pg_get_serial_sequence('public.category_attributes', 'id'), COALESCE((SELECT MAX(id) FROM public.category_attributes), 1), (SELECT COUNT(*) > 0 FROM public.category_attributes));
-- SELECT setval(pg_get_serial_sequence('public.material_code_rule_versions', 'id'), COALESCE((SELECT MAX(id) FROM public.material_code_rule_versions), 1), (SELECT COUNT(*) > 0 FROM public.material_code_rule_versions));
-- SELECT setval(pg_get_serial_sequence('public.material_code_change_batches', 'id'), COALESCE((SELECT MAX(id) FROM public.material_code_change_batches), 1), (SELECT COUNT(*) > 0 FROM public.material_code_change_batches));
-- SELECT setval(pg_get_serial_sequence('public.material_code_serials', 'id'), COALESCE((SELECT MAX(id) FROM public.material_code_serials), 1), (SELECT COUNT(*) > 0 FROM public.material_code_serials));
-- SELECT setval(pg_get_serial_sequence('public.materials', 'id'), COALESCE((SELECT MAX(id) FROM public.materials), 1), (SELECT COUNT(*) > 0 FROM public.materials));
-- SELECT setval(pg_get_serial_sequence('public.material_code_change_details', 'id'), COALESCE((SELECT MAX(id) FROM public.material_code_change_details), 1), (SELECT COUNT(*) > 0 FROM public.material_code_change_details));
-- SELECT setval(pg_get_serial_sequence('public.material_code_mappings', 'id'), COALESCE((SELECT MAX(id) FROM public.material_code_mappings), 1), (SELECT COUNT(*) > 0 FROM public.material_code_mappings));
