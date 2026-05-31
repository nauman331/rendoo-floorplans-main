-- Correction logs table: every human edit in PlanCanvas
-- Critical for V2 ML training dataset
CREATE TABLE IF NOT EXISTS correction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  
  -- What was corrected
  correction_type VARCHAR(50) NOT NULL, -- 'polygon_edit', 'unit_classification', 'furniture_placement'
  unit_id VARCHAR(255) NOT NULL,
  
  -- Before/After state for training
  before_polygon JSONB, -- Original AI-detected polygon points
  after_polygon JSONB,  -- Operator-corrected polygon points
  before_classification VARCHAR(50), -- Original: 'hoofdtype'/'gespiegeld'/'variant'
  after_classification VARCHAR(50),
  before_area DECIMAL(10,2),
  after_area DECIMAL(10,2),
  
  -- Context (why was it corrected?)
  operator_notes TEXT,
  ai_confidence DECIMAL(3,2), -- Original AI confidence score
  correction_confidence DECIMAL(3,2), -- How confident is operator in fix?
  
  -- Metadata for V2 training
  original_ai_source VARCHAR(50), -- 'gpt4_vision' | 'claude_vision' | 'geometry_normaliser'
  mood_id VARCHAR(50), -- Which mood preset was selected
  input_file_type VARCHAR(10), -- 'dwg', 'dxf', 'pdf'
  
  -- Audit trail
  created_by VARCHAR(255), -- operator email/username
  created_at TIMESTAMP DEFAULT NOW(),
  edited_at TIMESTAMP,
  
  -- V2 ML labelling
  ml_label_verified BOOLEAN DEFAULT FALSE, -- reviewed by training team
  ml_label_notes TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_correction_logs_project_id ON correction_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_correction_logs_unit_id ON correction_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_correction_logs_correction_type ON correction_logs(correction_type);
CREATE INDEX IF NOT EXISTS idx_correction_logs_created_at ON correction_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_correction_logs_file_id ON correction_logs(file_id);

-- Track correction stats per operator (quality metrics)
CREATE TABLE IF NOT EXISTS operator_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_name VARCHAR(255),
  total_corrections INT DEFAULT 0,
  avg_correction_confidence DECIMAL(3,2),
  corrections_per_project INT DEFAULT 0,
  last_active TIMESTAMP,
  UNIQUE (operator_name)
);

-- Enable RLS (Row Level Security) for security
ALTER TABLE correction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only see their own project's corrections
CREATE POLICY "Users can view correction logs" ON correction_logs
  FOR SELECT
  USING (true); -- Adjust based on your auth model

CREATE POLICY "Users can insert correction logs" ON correction_logs
  FOR INSERT
  WITH CHECK (true); -- Adjust based on your auth model
