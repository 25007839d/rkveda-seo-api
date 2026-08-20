-- RKVeda SEO Platform
-- Database schema
-- Database is already created by Hostinger.
-- Do NOT add CREATE DATABASE or USE statements here.


CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS seo_projects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    project_name VARCHAR(150) NOT NULL,
    website_url VARCHAR(500) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    status ENUM('active', 'paused', 'completed') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_project_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS keywords (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    keyword VARCHAR(255) NOT NULL,
    search_engine VARCHAR(50) DEFAULT 'google',
    country VARCHAR(100) DEFAULT 'India',
    language VARCHAR(50) DEFAULT 'en',
    target_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_keyword_project
        FOREIGN KEY (project_id)
        REFERENCES seo_projects(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_project_keyword (project_id, keyword)
);


CREATE TABLE IF NOT EXISTS keyword_rankings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    keyword_id BIGINT UNSIGNED NOT NULL,
    ranking_position INT,
    ranking_url VARCHAR(500),
    search_volume INT DEFAULT 0,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ranking_keyword
        FOREIGN KEY (keyword_id)
        REFERENCES keywords(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS seo_audits (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    score DECIMAL(5,2) DEFAULT 0,
    pages_crawled INT DEFAULT 0,
    issues_count INT DEFAULT 0,
    warnings_count INT DEFAULT 0,
    audit_status ENUM(
        'pending',
        'running',
        'completed',
        'failed'
    ) DEFAULT 'pending',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_project
        FOREIGN KEY (project_id)
        REFERENCES seo_projects(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS competitors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    competitor_domain VARCHAR(255) NOT NULL,
    competitor_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_competitor_project
        FOREIGN KEY (project_id)
        REFERENCES seo_projects(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS backlinks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    target_url VARCHAR(1000),
    anchor_text VARCHAR(500),
    domain_authority DECIMAL(6,2),
    status ENUM(
        'active',
        'lost',
        'new'
    ) DEFAULT 'active',
    first_seen_at TIMESTAMP NULL,
    last_seen_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_backlink_project
        FOREIGN KEY (project_id)
        REFERENCES seo_projects(id)
        ON DELETE CASCADE
);