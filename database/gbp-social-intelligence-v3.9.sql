-- GBP + Social Intelligence migration. Runtime services also create missing tables safely.
-- GBP base connection is compatible with existing unified-seo-platform.sql.

CREATE TABLE IF NOT EXISTS gbp_locations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, account_id VARCHAR(255) NOT NULL,
 location_id VARCHAR(255) NOT NULL, location_name VARCHAR(255), title VARCHAR(255), website_uri VARCHAR(1000), phone VARCHAR(100),
 address_text TEXT, category VARCHAR(255), status VARCHAR(100), metadata_json JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_gbp_location_project(project_id,location_id),
 CONSTRAINT fk_gbp_locations_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gbp_reviews (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, location_id VARCHAR(255) NOT NULL,
 review_id VARCHAR(255) NOT NULL, reviewer_name VARCHAR(255), star_rating VARCHAR(30), comment TEXT, create_time DATETIME,
 update_time DATETIME, has_reply TINYINT(1) DEFAULT 0, raw_json JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_gbp_review_project(project_id,review_id),
 CONSTRAINT fk_gbp_reviews_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gbp_metrics_daily (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, location_id VARCHAR(255) NOT NULL,
 metric_date DATE NOT NULL, metric VARCHAR(100) NOT NULL, value DECIMAL(20,4) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_gbp_metric(project_id,location_id,metric_date,metric), CONSTRAINT fk_gbp_metrics_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_profiles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, platform ENUM('facebook','instagram','linkedin','youtube','x','tiktok','other') NOT NULL,
 handle VARCHAR(255), profile_url VARCHAR(1000), followers BIGINT UNSIGNED DEFAULT 0, following BIGINT UNSIGNED DEFAULT 0, posts_count BIGINT UNSIGNED DEFAULT 0,
 verified TINYINT(1) DEFAULT 0, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_social_profile(project_id,platform), CONSTRAINT fk_social_profile_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_metrics_daily (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, platform ENUM('facebook','instagram','linkedin','youtube','x','tiktok','other') NOT NULL,
 metric_date DATE NOT NULL, followers BIGINT DEFAULT 0, posts BIGINT DEFAULT 0, reach BIGINT DEFAULT 0, impressions BIGINT DEFAULT 0, likes BIGINT DEFAULT 0,
 comments BIGINT DEFAULT 0, shares BIGINT DEFAULT 0, video_views BIGINT DEFAULT 0, clicks BIGINT DEFAULT 0, engagement_rate DECIMAL(10,4) DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_social_metric(project_id,platform,metric_date),
 CONSTRAINT fk_social_metric_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_posts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, platform ENUM('facebook','instagram','linkedin','youtube','x','tiktok','other') NOT NULL,
 post_url VARCHAR(1000), published_at DATETIME, caption TEXT, likes BIGINT DEFAULT 0, comments BIGINT DEFAULT 0, shares BIGINT DEFAULT 0, views BIGINT DEFAULT 0,
 clicks BIGINT DEFAULT 0, engagement_rate DECIMAL(10,4) DEFAULT 0, source VARCHAR(50) DEFAULT 'manual', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_social_post_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE, KEY idx_social_posts_project_platform(project_id,platform)
) ENGINE=InnoDB;
