export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ab_experiments: {
        Row: {
          alpha: number
          control_group_filter: Json | null
          created_at: string
          created_by: string
          dataset_id: string | null
          description: string | null
          ended_at: string | null
          hypothesis: string | null
          id: string
          minimum_detectable_effect: number | null
          name: string
          organization_id: string
          primary_metric: string
          results: Json | null
          secondary_metrics: string[] | null
          started_at: string | null
          status: string
          target_sample_size: number | null
          treatment_group_filter: Json | null
          updated_at: string
        }
        Insert: {
          alpha?: number
          control_group_filter?: Json | null
          created_at?: string
          created_by: string
          dataset_id?: string | null
          description?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          minimum_detectable_effect?: number | null
          name: string
          organization_id: string
          primary_metric: string
          results?: Json | null
          secondary_metrics?: string[] | null
          started_at?: string | null
          status?: string
          target_sample_size?: number | null
          treatment_group_filter?: Json | null
          updated_at?: string
        }
        Update: {
          alpha?: number
          control_group_filter?: Json | null
          created_at?: string
          created_by?: string
          dataset_id?: string | null
          description?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          minimum_detectable_effect?: number | null
          name?: string
          organization_id?: string
          primary_metric?: string
          results?: Json | null
          secondary_metrics?: string[] | null
          started_at?: string | null
          status?: string
          target_sample_size?: number | null
          treatment_group_filter?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_experiments_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_experiments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_instances: {
        Row: {
          action: string
          advisory_lane: string
          advisory_type: string
          assigned_to: string | null
          blending_rule: string | null
          capped_confidence: number | null
          category: string
          client_confidence: number | null
          client_evidence_summary: string | null
          combined_interpretation: string | null
          confidence: number | null
          confidence_cap_reason: string | null
          confidence_delta: number | null
          created_at: string
          data_quality_index: number | null
          data_snapshot_date: string | null
          dataset_id: string | null
          decision_context_id: string | null
          decision_enrichment_id: string | null
          detection_model: string | null
          deviation_score: number | null
          enriched_confidence: number | null
          evidence_sources: Json
          ewma_baseline: number | null
          ewma_std: number | null
          expected_impact: string | null
          generation_version: number | null
          id: string
          impact_score: number | null
          insight_object: Json | null
          internal_context_summary: string | null
          kpi_affected: Json | null
          model_parameters: Json | null
          organization_id: string
          playbook_steps: Json | null
          priority: string
          rationale: string | null
          raw_confidence: number | null
          resolution_summary: string | null
          resolved_at: string | null
          source_evidence: Json | null
          status: string
          timeframe: string | null
          title: string
          updated_at: string
          variance_score: number | null
          z_score: number | null
        }
        Insert: {
          action: string
          advisory_lane?: string
          advisory_type: string
          assigned_to?: string | null
          blending_rule?: string | null
          capped_confidence?: number | null
          category?: string
          client_confidence?: number | null
          client_evidence_summary?: string | null
          combined_interpretation?: string | null
          confidence?: number | null
          confidence_cap_reason?: string | null
          confidence_delta?: number | null
          created_at?: string
          data_quality_index?: number | null
          data_snapshot_date?: string | null
          dataset_id?: string | null
          decision_context_id?: string | null
          decision_enrichment_id?: string | null
          detection_model?: string | null
          deviation_score?: number | null
          enriched_confidence?: number | null
          evidence_sources?: Json
          ewma_baseline?: number | null
          ewma_std?: number | null
          expected_impact?: string | null
          generation_version?: number | null
          id?: string
          impact_score?: number | null
          insight_object?: Json | null
          internal_context_summary?: string | null
          kpi_affected?: Json | null
          model_parameters?: Json | null
          organization_id: string
          playbook_steps?: Json | null
          priority?: string
          rationale?: string | null
          raw_confidence?: number | null
          resolution_summary?: string | null
          resolved_at?: string | null
          source_evidence?: Json | null
          status?: string
          timeframe?: string | null
          title: string
          updated_at?: string
          variance_score?: number | null
          z_score?: number | null
        }
        Update: {
          action?: string
          advisory_lane?: string
          advisory_type?: string
          assigned_to?: string | null
          blending_rule?: string | null
          capped_confidence?: number | null
          category?: string
          client_confidence?: number | null
          client_evidence_summary?: string | null
          combined_interpretation?: string | null
          confidence?: number | null
          confidence_cap_reason?: string | null
          confidence_delta?: number | null
          created_at?: string
          data_quality_index?: number | null
          data_snapshot_date?: string | null
          dataset_id?: string | null
          decision_context_id?: string | null
          decision_enrichment_id?: string | null
          detection_model?: string | null
          deviation_score?: number | null
          enriched_confidence?: number | null
          evidence_sources?: Json
          ewma_baseline?: number | null
          ewma_std?: number | null
          expected_impact?: string | null
          generation_version?: number | null
          id?: string
          impact_score?: number | null
          insight_object?: Json | null
          internal_context_summary?: string | null
          kpi_affected?: Json | null
          model_parameters?: Json | null
          organization_id?: string
          playbook_steps?: Json | null
          priority?: string
          rationale?: string | null
          raw_confidence?: number | null
          resolution_summary?: string | null
          resolved_at?: string | null
          source_evidence?: Json | null
          status?: string
          timeframe?: string | null
          title?: string
          updated_at?: string
          variance_score?: number | null
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "advisory_instances_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_instances_decision_context_id_fkey"
            columns: ["decision_context_id"]
            isOneToOne: false
            referencedRelation: "decision_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_instances_decision_enrichment_id_fkey"
            columns: ["decision_enrichment_id"]
            isOneToOne: false
            referencedRelation: "decision_enrichment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_explanations: {
        Row: {
          confidence_breakdown: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          explanation_narrative: string | null
          feature_attributions: Json
          id: string
          model_used: string | null
          organization_id: string
        }
        Insert: {
          confidence_breakdown?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          explanation_narrative?: string | null
          feature_attributions?: Json
          id?: string
          model_used?: string | null
          organization_id: string
        }
        Update: {
          confidence_breakdown?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          explanation_narrative?: string | null
          feature_attributions?: Json
          id?: string
          model_used?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_explanations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_data_quality_checks: {
        Row: {
          check_type: string
          checked_at: string
          count_affected: number
          details: Json
          id: string
          organization_id: string
          passed: boolean
          run_id: string | null
          severity: string
          surface: string
        }
        Insert: {
          check_type: string
          checked_at?: string
          count_affected?: number
          details?: Json
          id?: string
          organization_id: string
          passed: boolean
          run_id?: string | null
          severity?: string
          surface: string
        }
        Update: {
          check_type?: string
          checked_at?: string
          count_affected?: number
          details?: Json
          id?: string
          organization_id?: string
          passed?: boolean
          run_id?: string | null
          severity?: string
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "aicis_data_quality_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "aicis_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_export_batches: {
        Row: {
          batch_ref: string
          completed_at: string | null
          duplicates_suppressed: number
          error: string | null
          id: string
          item_count: number
          organization_id: string
          processing_ms: number | null
          received_at: string
          schema_version: string
          source: string
          status: string
        }
        Insert: {
          batch_ref: string
          completed_at?: string | null
          duplicates_suppressed?: number
          error?: string | null
          id?: string
          item_count?: number
          organization_id: string
          processing_ms?: number | null
          received_at?: string
          schema_version: string
          source: string
          status?: string
        }
        Update: {
          batch_ref?: string
          completed_at?: string | null
          duplicates_suppressed?: number
          error?: string | null
          id?: string
          item_count?: number
          organization_id?: string
          processing_ms?: number | null
          received_at?: string
          schema_version?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      aicis_influence_graph: {
        Row: {
          description: string | null
          detected_at: string | null
          domain: string | null
          edge_kind: string
          external_id: string
          id: string
          ingested_at: string
          lag_days: number | null
          organization_id: string
          region: string | null
          sample_size: number | null
          source_node: string
          source_record_id: string | null
          target_node: string
          weight: number
        }
        Insert: {
          description?: string | null
          detected_at?: string | null
          domain?: string | null
          edge_kind: string
          external_id: string
          id?: string
          ingested_at?: string
          lag_days?: number | null
          organization_id: string
          region?: string | null
          sample_size?: number | null
          source_node: string
          source_record_id?: string | null
          target_node: string
          weight?: number
        }
        Update: {
          description?: string | null
          detected_at?: string | null
          domain?: string | null
          edge_kind?: string
          external_id?: string
          id?: string
          ingested_at?: string
          lag_days?: number | null
          organization_id?: string
          region?: string | null
          sample_size?: number | null
          source_node?: string
          source_record_id?: string | null
          target_node?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "aicis_influence_graph_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aicis_influence_graph_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "aicis_ingested_records"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_ingested_records: {
        Row: {
          content_hash: string
          country_iso3: string | null
          domain: string | null
          external_id: string
          id: string
          ingested_at: string
          organization_id: string
          payload: Json
          source_run_id: string | null
          surface: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          country_iso3?: string | null
          domain?: string | null
          external_id: string
          id?: string
          ingested_at?: string
          organization_id: string
          payload: Json
          source_run_id?: string | null
          surface: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          country_iso3?: string | null
          domain?: string | null
          external_id?: string
          id?: string
          ingested_at?: string
          organization_id?: string
          payload?: Json
          source_run_id?: string | null
          surface?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aicis_ingested_records_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "aicis_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_intelligence_items: {
        Row: {
          cluster_id: string | null
          content_hash: string
          domain: string | null
          entities: Json
          export_batch_id: string | null
          geography: string[]
          global_criticality_score: number
          id: string
          ingested_at: string
          last_transition_at: string
          occurred_at: string | null
          organization_id: string
          payload: Json
          resolution_notes: string | null
          resolution_status: string | null
          schema_version: string
          severity: string
          source_ref: string | null
          source_surface: string
          status: Database["public"]["Enums"]["intelligence_status"]
          summary: string | null
          title: string | null
          urgency: string
        }
        Insert: {
          cluster_id?: string | null
          content_hash: string
          domain?: string | null
          entities?: Json
          export_batch_id?: string | null
          geography?: string[]
          global_criticality_score?: number
          id?: string
          ingested_at?: string
          last_transition_at?: string
          occurred_at?: string | null
          organization_id: string
          payload?: Json
          resolution_notes?: string | null
          resolution_status?: string | null
          schema_version?: string
          severity?: string
          source_ref?: string | null
          source_surface: string
          status?: Database["public"]["Enums"]["intelligence_status"]
          summary?: string | null
          title?: string | null
          urgency?: string
        }
        Update: {
          cluster_id?: string | null
          content_hash?: string
          domain?: string | null
          entities?: Json
          export_batch_id?: string | null
          geography?: string[]
          global_criticality_score?: number
          id?: string
          ingested_at?: string
          last_transition_at?: string
          occurred_at?: string | null
          organization_id?: string
          payload?: Json
          resolution_notes?: string | null
          resolution_status?: string | null
          schema_version?: string
          severity?: string
          source_ref?: string | null
          source_surface?: string
          status?: Database["public"]["Enums"]["intelligence_status"]
          summary?: string | null
          title?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "aicis_intelligence_items_export_batch_id_fkey"
            columns: ["export_batch_id"]
            isOneToOne: false
            referencedRelation: "aicis_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_items_cluster_fk"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "intelligence_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_outcomes: {
        Row: {
          actual_value: number | null
          brier_score: number | null
          country_iso3: string | null
          domain: string | null
          error_margin: number | null
          evaluated_at: string | null
          external_id: string
          id: string
          ingested_at: string
          organization_id: string
          predicted_value: number | null
          prediction_external_id: string | null
          source_record_id: string | null
        }
        Insert: {
          actual_value?: number | null
          brier_score?: number | null
          country_iso3?: string | null
          domain?: string | null
          error_margin?: number | null
          evaluated_at?: string | null
          external_id: string
          id?: string
          ingested_at?: string
          organization_id: string
          predicted_value?: number | null
          prediction_external_id?: string | null
          source_record_id?: string | null
        }
        Update: {
          actual_value?: number | null
          brier_score?: number | null
          country_iso3?: string | null
          domain?: string | null
          error_margin?: number | null
          evaluated_at?: string | null
          external_id?: string
          id?: string
          ingested_at?: string
          organization_id?: string
          predicted_value?: number | null
          prediction_external_id?: string | null
          source_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aicis_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aicis_outcomes_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "aicis_ingested_records"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_predictions: {
        Row: {
          confidence_lower: number | null
          confidence_upper: number | null
          country_iso3: string | null
          domain: string | null
          evidence_count: number | null
          external_id: string
          factors: Json | null
          generated_at: string | null
          horizon_days: number | null
          id: string
          ingested_at: string
          model_version: string | null
          organization_id: string
          rank_position: number | null
          risk_probability: number
          source_record_id: string | null
        }
        Insert: {
          confidence_lower?: number | null
          confidence_upper?: number | null
          country_iso3?: string | null
          domain?: string | null
          evidence_count?: number | null
          external_id: string
          factors?: Json | null
          generated_at?: string | null
          horizon_days?: number | null
          id?: string
          ingested_at?: string
          model_version?: string | null
          organization_id: string
          rank_position?: number | null
          risk_probability: number
          source_record_id?: string | null
        }
        Update: {
          confidence_lower?: number | null
          confidence_upper?: number | null
          country_iso3?: string | null
          domain?: string | null
          evidence_count?: number | null
          external_id?: string
          factors?: Json | null
          generated_at?: string | null
          horizon_days?: number | null
          id?: string
          ingested_at?: string
          model_version?: string | null
          organization_id?: string
          rank_position?: number | null
          risk_probability?: number
          source_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aicis_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aicis_predictions_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "aicis_ingested_records"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_recommendations: {
        Row: {
          confidence: number | null
          country_iso3: string | null
          domain: string | null
          estimated_cost_eur: number | null
          estimated_roi_eur: number | null
          expected_roi_lower: number | null
          expected_roi_upper: number | null
          external_id: string
          generated_at: string | null
          id: string
          ingested_at: string
          intervention_title: string | null
          intervention_type: string | null
          organization_id: string
          rationale_md: string | null
          source_record_id: string | null
          status: string | null
          urgency_hours: number | null
          urgency_window: string | null
        }
        Insert: {
          confidence?: number | null
          country_iso3?: string | null
          domain?: string | null
          estimated_cost_eur?: number | null
          estimated_roi_eur?: number | null
          expected_roi_lower?: number | null
          expected_roi_upper?: number | null
          external_id: string
          generated_at?: string | null
          id?: string
          ingested_at?: string
          intervention_title?: string | null
          intervention_type?: string | null
          organization_id: string
          rationale_md?: string | null
          source_record_id?: string | null
          status?: string | null
          urgency_hours?: number | null
          urgency_window?: string | null
        }
        Update: {
          confidence?: number | null
          country_iso3?: string | null
          domain?: string | null
          estimated_cost_eur?: number | null
          estimated_roi_eur?: number | null
          expected_roi_lower?: number | null
          expected_roi_upper?: number | null
          external_id?: string
          generated_at?: string | null
          id?: string
          ingested_at?: string
          intervention_title?: string | null
          intervention_type?: string | null
          organization_id?: string
          rationale_md?: string | null
          source_record_id?: string | null
          status?: string | null
          urgency_hours?: number | null
          urgency_window?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aicis_recommendations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aicis_recommendations_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "aicis_ingested_records"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_sync_errors: {
        Row: {
          context: Json
          error_code: string | null
          error_message: string
          http_status: number | null
          id: string
          occurred_at: string
          organization_id: string
          run_id: string | null
          surface: string
        }
        Insert: {
          context?: Json
          error_code?: string | null
          error_message: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          organization_id: string
          run_id?: string | null
          surface: string
        }
        Update: {
          context?: Json
          error_code?: string | null
          error_message?: string
          http_status?: number | null
          id?: string
          occurred_at?: string
          organization_id?: string
          run_id?: string | null
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "aicis_sync_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "aicis_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      aicis_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          last_offset: number | null
          metadata: Json
          next_offset: number | null
          organization_id: string
          pages_fetched: number
          payload_checksum: string | null
          records_failed: number
          records_inserted: number
          records_pulled: number
          records_updated: number
          started_at: string
          status: Database["public"]["Enums"]["aicis_sync_status"]
          surface: string
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          last_offset?: number | null
          metadata?: Json
          next_offset?: number | null
          organization_id: string
          pages_fetched?: number
          payload_checksum?: string | null
          records_failed?: number
          records_inserted?: number
          records_pulled?: number
          records_updated?: number
          started_at?: string
          status?: Database["public"]["Enums"]["aicis_sync_status"]
          surface: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          last_offset?: number | null
          metadata?: Json
          next_offset?: number | null
          organization_id?: string
          pages_fetched?: number
          payload_checksum?: string | null
          records_failed?: number
          records_inserted?: number
          records_pulled?: number
          records_updated?: number
          started_at?: string
          status?: Database["public"]["Enums"]["aicis_sync_status"]
          surface?: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      aicis_sync_surface_status: {
        Row: {
          circuit_breaker_until: string | null
          consecutive_failures: number
          freshness_seconds: number | null
          id: string
          last_attempt_at: string | null
          last_error_at: string | null
          last_error_message: string | null
          last_run_id: string | null
          last_status: Database["public"]["Enums"]["aicis_sync_status"] | null
          last_success_at: string | null
          metadata: Json
          organization_id: string
          records_available: number | null
          schema_fingerprint: string | null
          surface: string
          total_records: number
          updated_at: string
        }
        Insert: {
          circuit_breaker_until?: string | null
          consecutive_failures?: number
          freshness_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error_at?: string | null
          last_error_message?: string | null
          last_run_id?: string | null
          last_status?: Database["public"]["Enums"]["aicis_sync_status"] | null
          last_success_at?: string | null
          metadata?: Json
          organization_id: string
          records_available?: number | null
          schema_fingerprint?: string | null
          surface: string
          total_records?: number
          updated_at?: string
        }
        Update: {
          circuit_breaker_until?: string | null
          consecutive_failures?: number
          freshness_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error_at?: string | null
          last_error_message?: string | null
          last_run_id?: string | null
          last_status?: Database["public"]["Enums"]["aicis_sync_status"] | null
          last_success_at?: string | null
          metadata?: Json
          organization_id?: string
          records_available?: number | null
          schema_fingerprint?: string | null
          surface?: string
          total_records?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aicis_sync_surface_status_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "aicis_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_playbooks: {
        Row: {
          cooldown_minutes: number
          created_at: string
          created_by: string
          description: string | null
          escalation_steps: Json
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          organization_id: string
          severity: string
          trigger_condition: string
          trigger_metric: string
          trigger_threshold: number
          updated_at: string
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          created_by: string
          description?: string | null
          escalation_steps?: Json
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          organization_id: string
          severity?: string
          trigger_condition?: string
          trigger_metric: string
          trigger_threshold: number
          updated_at?: string
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string
          description?: string | null
          escalation_steps?: Json
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          organization_id?: string
          severity?: string
          trigger_condition?: string
          trigger_metric?: string
          trigger_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_playbooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_compute_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          error_message: string | null
          id: string
          job_type: string
          organization_id: string
          parameters: Json | null
          priority: number
          result: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          organization_id: string
          parameters?: Json | null
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          organization_id?: string
          parameters?: Json | null
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_compute_jobs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_compute_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_chain_stages: {
        Row: {
          approval_stage: string
          approvals_received: number
          approver_role: string | null
          created_at: string
          decision_id: string
          id: string
          metadata: Json
          organization_id: string
          required_quorum: number
          satisfied: boolean
          satisfied_at: string | null
          sequence_order: number
        }
        Insert: {
          approval_stage: string
          approvals_received?: number
          approver_role?: string | null
          created_at?: string
          decision_id: string
          id?: string
          metadata?: Json
          organization_id: string
          required_quorum?: number
          satisfied?: boolean
          satisfied_at?: string | null
          sequence_order: number
        }
        Update: {
          approval_stage?: string
          approvals_received?: number
          approver_role?: string | null
          created_at?: string
          decision_id?: string
          id?: string
          metadata?: Json
          organization_id?: string
          required_quorum?: number
          satisfied?: boolean
          satisfied_at?: string | null
          sequence_order?: number
        }
        Relationships: []
      }
      attention_budget_config: {
        Row: {
          fatigue_demotion_threshold: number
          max_active_exec_narratives: number
          max_active_ops_narratives: number
          max_daily_new_narratives: number
          min_confidence_to_publish: number
          min_pressure_to_publish: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          fatigue_demotion_threshold?: number
          max_active_exec_narratives?: number
          max_active_ops_narratives?: number
          max_daily_new_narratives?: number
          min_confidence_to_publish?: number
          min_pressure_to_publish?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          fatigue_demotion_threshold?: number
          max_active_exec_narratives?: number
          max_active_ops_narratives?: number
          max_daily_new_narratives?: number
          min_confidence_to_publish?: number
          min_pressure_to_publish?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      attribution_results: {
        Row: {
          computed_at: string
          credit: number
          decision_id: string | null
          id: string
          model: string
          organization_id: string
          touchpoint_id: string | null
        }
        Insert: {
          computed_at?: string
          credit: number
          decision_id?: string | null
          id?: string
          model: string
          organization_id: string
          touchpoint_id?: string | null
        }
        Update: {
          computed_at?: string
          credit?: number
          decision_id?: string | null
          id?: string
          model?: string
          organization_id?: string
          touchpoint_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_results_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_results_touchpoint_id_fkey"
            columns: ["touchpoint_id"]
            isOneToOne: false
            referencedRelation: "attribution_touchpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_touchpoints: {
        Row: {
          created_at: string
          decision_id: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          organization_id: string
          touchpoint_type: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          organization_id: string
          touchpoint_type: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          organization_id?: string
          touchpoint_type?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_touchpoints_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_touchpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          ip_address: string | null
          organization_id: string
          payload: Json | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id: string
          payload?: Json | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id?: string
          payload?: Json | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          organization_id: string | null
          risk_score: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          risk_score?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          risk_score?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          attempts: number
          created_at: string
          key: string
          updated_at: string
          window_seconds: number
          window_start: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          key: string
          updated_at?: string
          window_seconds?: number
          window_start: number
        }
        Update: {
          attempts?: number
          created_at?: string
          key?: string
          updated_at?: string
          window_seconds?: number
          window_start?: number
        }
        Relationships: []
      }
      bandit_experiments: {
        Row: {
          arms: Json
          created_at: string
          created_by: string | null
          description: string | null
          epsilon: number | null
          exploration_bonus: number | null
          id: string
          name: string
          organization_id: string
          status: string
          strategy: string
          total_pulls: number | null
          updated_at: string
        }
        Insert: {
          arms?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          epsilon?: number | null
          exploration_bonus?: number | null
          id?: string
          name: string
          organization_id: string
          status?: string
          strategy?: string
          total_pulls?: number | null
          updated_at?: string
        }
        Update: {
          arms?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          epsilon?: number | null
          exploration_bonus?: number | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          strategy?: string
          total_pulls?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bandit_experiments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bandit_rewards: {
        Row: {
          arm_id: string
          context_features: Json | null
          created_at: string
          experiment_id: string
          id: string
          organization_id: string
          reward: number
        }
        Insert: {
          arm_id: string
          context_features?: Json | null
          created_at?: string
          experiment_id: string
          id?: string
          organization_id: string
          reward?: number
        }
        Update: {
          arm_id?: string
          context_features?: Json | null
          created_at?: string
          experiment_id?: string
          id?: string
          organization_id?: string
          reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "bandit_rewards_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "bandit_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bandit_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_scores: {
        Row: {
          benchmark_id: string
          computed_at: string
          created_at: string
          current_value: number
          gap_to_p75: number | null
          gap_to_p90: number | null
          id: string
          metric_type: string
          organization_id: string
          percentile_rank: number
          quartile: number
          trend: string | null
        }
        Insert: {
          benchmark_id: string
          computed_at?: string
          created_at?: string
          current_value: number
          gap_to_p75?: number | null
          gap_to_p90?: number | null
          id?: string
          metric_type: string
          organization_id: string
          percentile_rank?: number
          quartile?: number
          trend?: string | null
        }
        Update: {
          benchmark_id?: string
          computed_at?: string
          created_at?: string
          current_value?: number
          gap_to_p75?: number | null
          gap_to_p90?: number | null
          id?: string
          metric_type?: string
          organization_id?: string
          percentile_rank?: number
          quartile?: number
          trend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_scores_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "industry_benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_assessments: {
        Row: {
          bias_markers: Json | null
          brier_score: number | null
          calibration_profile: string | null
          completed_at: string | null
          created_at: string
          id: string
          organization_id: string
          overconfidence_score: number | null
          responses: Json
          underconfidence_score: number | null
          user_id: string
        }
        Insert: {
          bias_markers?: Json | null
          brier_score?: number | null
          calibration_profile?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          overconfidence_score?: number | null
          responses?: Json
          underconfidence_score?: number | null
          user_id: string
        }
        Update: {
          bias_markers?: Json | null
          brier_score?: number | null
          calibration_profile?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          overconfidence_score?: number | null
          responses?: Json
          underconfidence_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      calibration_models: {
        Row: {
          ai_narrative: string | null
          band_corrections: Json
          band_sample_sizes: Json
          computed_at: string
          confidence_bands_count: number
          created_at: string
          id: string
          low_sample_bands: Json
          mean_absolute_error: number | null
          model_version: number
          organization_id: string
          overall_bias_direction: string | null
          overall_calibration_score: number | null
          smoothing_alpha: number
          smoothing_beta: number
          success_metric: string
          total_decisions_analyzed: number
          window_decisions_count: number
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          ai_narrative?: string | null
          band_corrections?: Json
          band_sample_sizes?: Json
          computed_at?: string
          confidence_bands_count?: number
          created_at?: string
          id?: string
          low_sample_bands?: Json
          mean_absolute_error?: number | null
          model_version?: number
          organization_id: string
          overall_bias_direction?: string | null
          overall_calibration_score?: number | null
          smoothing_alpha?: number
          smoothing_beta?: number
          success_metric?: string
          total_decisions_analyzed?: number
          window_decisions_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          ai_narrative?: string | null
          band_corrections?: Json
          band_sample_sizes?: Json
          computed_at?: string
          confidence_bands_count?: number
          created_at?: string
          id?: string
          low_sample_bands?: Json
          mean_absolute_error?: number | null
          model_version?: number
          organization_id?: string
          overall_bias_direction?: string | null
          overall_calibration_score?: number | null
          smoothing_alpha?: number
          smoothing_beta?: number
          success_metric?: string
          total_decisions_analyzed?: number
          window_decisions_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_models_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_dimensions: {
        Row: {
          attributes: Json
          created_at: string
          dimension_key: string
          id: string
          label: string | null
          organization_id: string
          parent_dimension_id: string | null
          value: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          dimension_key: string
          id?: string
          label?: string | null
          organization_id: string
          parent_dimension_id?: string | null
          value: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          dimension_key?: string
          id?: string
          label?: string | null
          organization_id?: string
          parent_dimension_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_dimensions_parent_dimension_id_fkey"
            columns: ["parent_dimension_id"]
            isOneToOne: false
            referencedRelation: "canonical_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_entities: {
        Row: {
          attributes: Json
          connector_id: string | null
          created_at: string
          display_name: string | null
          entity_type: string
          external_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          natural_key: string | null
          organization_id: string
          source_type: string
        }
        Insert: {
          attributes?: Json
          connector_id?: string | null
          created_at?: string
          display_name?: string | null
          entity_type: string
          external_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          natural_key?: string | null
          organization_id: string
          source_type: string
        }
        Update: {
          attributes?: Json
          connector_id?: string | null
          created_at?: string
          display_name?: string | null
          entity_type?: string
          external_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          natural_key?: string | null
          organization_id?: string
          source_type?: string
        }
        Relationships: []
      }
      canonical_events: {
        Row: {
          attributes: Json
          connector_id: string | null
          entity_id: string | null
          event_type: string
          external_id: string | null
          id: string
          ingested_at: string
          occurred_at: string
          organization_id: string
          source_type: string
        }
        Insert: {
          attributes?: Json
          connector_id?: string | null
          entity_id?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          ingested_at?: string
          occurred_at: string
          organization_id: string
          source_type: string
        }
        Update: {
          attributes?: Json
          connector_id?: string | null
          entity_id?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          ingested_at?: string
          occurred_at?: string
          organization_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "canonical_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_metrics: {
        Row: {
          connector_id: string | null
          dimensions: Json
          entity_id: string | null
          id: string
          ingested_at: string
          metric_key: string
          organization_id: string
          period_grain: string
          period_start: string
          source_type: string
          unit: string | null
          value: number
        }
        Insert: {
          connector_id?: string | null
          dimensions?: Json
          entity_id?: string | null
          id?: string
          ingested_at?: string
          metric_key: string
          organization_id: string
          period_grain?: string
          period_start: string
          source_type: string
          unit?: string | null
          value: number
        }
        Update: {
          connector_id?: string | null
          dimensions?: Json
          entity_id?: string | null
          id?: string
          ingested_at?: string
          metric_key?: string
          organization_id?: string
          period_grain?: string
          period_start?: string
          source_type?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "canonical_metrics_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "canonical_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_relationships: {
        Row: {
          attributes: Json
          connector_id: string | null
          created_at: string
          first_seen_at: string
          from_entity_id: string
          id: string
          last_seen_at: string
          organization_id: string
          relationship_type: string
          source_type: string
          to_entity_id: string
        }
        Insert: {
          attributes?: Json
          connector_id?: string | null
          created_at?: string
          first_seen_at?: string
          from_entity_id: string
          id?: string
          last_seen_at?: string
          organization_id: string
          relationship_type: string
          source_type: string
          to_entity_id: string
        }
        Update: {
          attributes?: Json
          connector_id?: string | null
          created_at?: string
          first_seen_at?: string
          from_entity_id?: string
          id?: string
          last_seen_at?: string
          organization_id?: string
          relationship_type?: string
          source_type?: string
          to_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_relationships_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "canonical_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_relationships_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "canonical_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      causal_models: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          dag_structure: Json
          description: string | null
          id: string
          inference_results: Json | null
          model_status: string
          name: string
          organization_id: string
          sample_size: number | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          dag_structure?: Json
          description?: string | null
          id?: string
          inference_results?: Json | null
          model_status?: string
          name: string
          organization_id: string
          sample_size?: number | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          dag_structure?: Json
          description?: string | null
          id?: string
          inference_results?: Json | null
          model_status?: string
          name?: string
          organization_id?: string
          sample_size?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "causal_models_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cognitive_bias_detections: {
        Row: {
          bias_name: string
          bias_type: string
          confidence: number | null
          decision_id: string | null
          description: string
          detected_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json | null
          id: string
          mitigation_suggestion: string | null
          organization_id: string
          severity: string
        }
        Insert: {
          bias_name: string
          bias_type: string
          confidence?: number | null
          decision_id?: string | null
          description: string
          detected_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json | null
          id?: string
          mitigation_suggestion?: string | null
          organization_id: string
          severity?: string
        }
        Update: {
          bias_name?: string
          bias_type?: string
          confidence?: number | null
          decision_id?: string | null
          description?: string
          detected_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json | null
          id?: string
          mitigation_suggestion?: string | null
          organization_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "cognitive_bias_detections_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cognitive_bias_detections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_definitions: {
        Row: {
          activity_field: string
          cached_results: Json | null
          cohort_field: string
          created_at: string
          created_by: string
          dataset_id: string | null
          description: string | null
          entity_field: string
          filters: Json | null
          id: string
          last_computed_at: string | null
          name: string
          organization_id: string
          period_type: string
          updated_at: string
        }
        Insert: {
          activity_field: string
          cached_results?: Json | null
          cohort_field: string
          created_at?: string
          created_by: string
          dataset_id?: string | null
          description?: string | null
          entity_field?: string
          filters?: Json | null
          id?: string
          last_computed_at?: string | null
          name: string
          organization_id: string
          period_type?: string
          updated_at?: string
        }
        Update: {
          activity_field?: string
          cached_results?: Json | null
          cohort_field?: string
          created_at?: string
          created_by?: string
          dataset_id?: string | null
          description?: string | null
          entity_field?: string
          filters?: Json | null
          id?: string
          last_computed_at?: string | null
          name?: string
          organization_id?: string
          period_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_definitions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_associations: {
        Row: {
          co_occurrences: number
          computed_at: string
          concept_a: string
          concept_b: string
          confidence: number
          corpus_size: number
          id: string
          last_seen_at: string
          lift: number
          organization_id: string
          source_window_days: number
          support: number
        }
        Insert: {
          co_occurrences?: number
          computed_at?: string
          concept_a: string
          concept_b: string
          confidence?: number
          corpus_size?: number
          id?: string
          last_seen_at?: string
          lift?: number
          organization_id: string
          source_window_days?: number
          support?: number
        }
        Update: {
          co_occurrences?: number
          computed_at?: string
          concept_a?: string
          concept_b?: string
          confidence?: number
          corpus_size?: number
          id?: string
          last_seen_at?: string
          lift?: number
          organization_id?: string
          source_window_days?: number
          support?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_associations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_circuit_state: {
        Row: {
          connector_id: string
          consecutive_failures: number
          failure_threshold: number
          id: string
          last_error: string | null
          next_probe_at: string | null
          opened_at: string | null
          organization_id: string
          retries_used_window: number
          retry_budget_per_hour: number
          state: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          connector_id: string
          consecutive_failures?: number
          failure_threshold?: number
          id?: string
          last_error?: string | null
          next_probe_at?: string | null
          opened_at?: string | null
          organization_id: string
          retries_used_window?: number
          retry_budget_per_hour?: number
          state?: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          connector_id?: string
          consecutive_failures?: number
          failure_threshold?: number
          id?: string
          last_error?: string | null
          next_probe_at?: string | null
          opened_at?: string | null
          organization_id?: string
          retries_used_window?: number
          retry_budget_per_hour?: number
          state?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      connector_configs: {
        Row: {
          connection_status: string | null
          connector_type: string
          created_at: string
          credential_vault_key: string | null
          data_source_id: string | null
          database_name: string | null
          discovered_schema: Json | null
          host: string | null
          id: string
          last_tested_at: string | null
          organization_id: string
          port: number | null
          schema_name: string | null
          selected_tables: Json | null
          ssl_mode: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          connection_status?: string | null
          connector_type?: string
          created_at?: string
          credential_vault_key?: string | null
          data_source_id?: string | null
          database_name?: string | null
          discovered_schema?: Json | null
          host?: string | null
          id?: string
          last_tested_at?: string | null
          organization_id: string
          port?: number | null
          schema_name?: string | null
          selected_tables?: Json | null
          ssl_mode?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          connection_status?: string | null
          connector_type?: string
          created_at?: string
          credential_vault_key?: string | null
          data_source_id?: string | null
          database_name?: string | null
          discovered_schema?: Json | null
          host?: string | null
          id?: string
          last_tested_at?: string | null
          organization_id?: string
          port?: number | null
          schema_name?: string | null
          selected_tables?: Json | null
          ssl_mode?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_configs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_dq_scores: {
        Row: {
          anomaly_score: number
          completeness_score: number
          computed_at: string
          confidence_score: number
          connector_id: string
          duplicate_rate: number
          freshness_score: number
          id: string
          notes: Json
          null_rate: number
          organization_id: string
          sample_size: number
          schema_stability_score: number
          stream_key: string | null
        }
        Insert: {
          anomaly_score?: number
          completeness_score?: number
          computed_at?: string
          confidence_score?: number
          connector_id: string
          duplicate_rate?: number
          freshness_score?: number
          id?: string
          notes?: Json
          null_rate?: number
          organization_id: string
          sample_size?: number
          schema_stability_score?: number
          stream_key?: string | null
        }
        Update: {
          anomaly_score?: number
          completeness_score?: number
          computed_at?: string
          confidence_score?: number
          connector_id?: string
          duplicate_rate?: number
          freshness_score?: number
          id?: string
          notes?: Json
          null_rate?: number
          organization_id?: string
          sample_size?: number
          schema_stability_score?: number
          stream_key?: string | null
        }
        Relationships: []
      }
      connector_field_mappings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          connector_id: string
          created_at: string
          id: string
          is_active: boolean
          mappings: Json
          organization_id: string
          validation_summary: Json | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          connector_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          mappings?: Json
          organization_id: string
          validation_summary?: Json | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          connector_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          mappings?: Json
          organization_id?: string
          validation_summary?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "connector_field_mappings_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_field_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_lineage_events: {
        Row: {
          connector_id: string
          created_at: string
          dataset_id: string | null
          details: Json
          event_type: string
          id: string
          organization_id: string
          records_count: number
          sync_run_id: string | null
        }
        Insert: {
          connector_id: string
          created_at?: string
          dataset_id?: string | null
          details?: Json
          event_type: string
          id?: string
          organization_id: string
          records_count?: number
          sync_run_id?: string | null
        }
        Update: {
          connector_id?: string
          created_at?: string
          dataset_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          organization_id?: string
          records_count?: number
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_lineage_events_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_lineage_events_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_lineage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_lineage_events_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "connector_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_sync_checkpoints: {
        Row: {
          change_event_ready: boolean
          connector_id: string
          cursor_field: string
          cursor_value: string | null
          high_watermark: string | null
          id: string
          last_change_token: string | null
          last_sync_run_id: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          change_event_ready?: boolean
          connector_id: string
          cursor_field: string
          cursor_value?: string | null
          high_watermark?: string | null
          id?: string
          last_change_token?: string | null
          last_sync_run_id?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          change_event_ready?: boolean
          connector_id?: string
          cursor_field?: string
          cursor_value?: string | null
          high_watermark?: string | null
          id?: string
          last_change_token?: string | null
          last_sync_run_id?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_checkpoints_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_checkpoints_last_sync_run_id_fkey"
            columns: ["last_sync_run_id"]
            isOneToOne: false
            referencedRelation: "connector_sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_sync_run_errors: {
        Row: {
          connector_id: string
          created_at: string
          error_kind: string
          error_message: string
          id: string
          is_resolved: boolean
          organization_id: string
          raw_payload: Json | null
          resolved_at: string | null
          resolved_by: string | null
          row_index: number | null
          sync_run_id: string
        }
        Insert: {
          connector_id: string
          created_at?: string
          error_kind: string
          error_message: string
          id?: string
          is_resolved?: boolean
          organization_id: string
          raw_payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_index?: number | null
          sync_run_id: string
        }
        Update: {
          connector_id?: string
          created_at?: string
          error_kind?: string
          error_message?: string
          id?: string
          is_resolved?: boolean
          organization_id?: string
          raw_payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_index?: number | null
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_run_errors_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_run_errors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_run_errors_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "connector_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_sync_runs: {
        Row: {
          checkpoint_after: Json | null
          checkpoint_before: Json | null
          completed_at: string | null
          connector_id: string
          created_at: string
          current_stage: string | null
          dataset_id: string | null
          duration_ms: number | null
          error_summary: string | null
          id: string
          metadata: Json
          organization_id: string
          request_id: string | null
          rows_extracted: number
          rows_inserted: number
          rows_invalid: number
          rows_skipped: number
          rows_updated: number
          rows_valid: number
          stage_timings: Json
          started_at: string
          status: Database["public"]["Enums"]["connector_run_status"]
          triggered_by: string
        }
        Insert: {
          checkpoint_after?: Json | null
          checkpoint_before?: Json | null
          completed_at?: string | null
          connector_id: string
          created_at?: string
          current_stage?: string | null
          dataset_id?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          request_id?: string | null
          rows_extracted?: number
          rows_inserted?: number
          rows_invalid?: number
          rows_skipped?: number
          rows_updated?: number
          rows_valid?: number
          stage_timings?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["connector_run_status"]
          triggered_by?: string
        }
        Update: {
          checkpoint_after?: Json | null
          checkpoint_before?: Json | null
          completed_at?: string | null
          connector_id?: string
          created_at?: string
          current_stage?: string | null
          dataset_id?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          request_id?: string | null
          rows_extracted?: number
          rows_inserted?: number
          rows_invalid?: number
          rows_skipped?: number
          rows_updated?: number
          rows_valid?: number
          stage_timings?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["connector_run_status"]
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_runs_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_sync_schedules: {
        Row: {
          connector_id: string
          created_at: string
          id: string
          is_active: boolean
          last_dispatch_at: string | null
          next_run_at: string | null
          organization_id: string
          schedule_kind: Database["public"]["Enums"]["connector_schedule_kind"]
          updated_at: string
        }
        Insert: {
          connector_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_dispatch_at?: string | null
          next_run_at?: string | null
          organization_id: string
          schedule_kind?: Database["public"]["Enums"]["connector_schedule_kind"]
          updated_at?: string
        }
        Update: {
          connector_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_dispatch_at?: string | null
          next_run_at?: string | null
          organization_id?: string
          schedule_kind?: Database["public"]["Enums"]["connector_schedule_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_schedules_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: true
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_throttle_state: {
        Row: {
          adaptive_backoff_ms: number
          connector_id: string
          consecutive_throttle_events: number
          daily_remaining: number | null
          id: string
          last_observed_at: string
          last_retry_after_ms: number | null
          last_status_code: number | null
          last_throttled_at: string | null
          organization_id: string
          remaining_quota: number | null
          reset_at: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          adaptive_backoff_ms?: number
          connector_id: string
          consecutive_throttle_events?: number
          daily_remaining?: number | null
          id?: string
          last_observed_at?: string
          last_retry_after_ms?: number | null
          last_status_code?: number | null
          last_throttled_at?: string | null
          organization_id: string
          remaining_quota?: number | null
          reset_at?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          adaptive_backoff_ms?: number
          connector_id?: string
          consecutive_throttle_events?: number
          daily_remaining?: number | null
          id?: string
          last_observed_at?: string
          last_retry_after_ms?: number | null
          last_status_code?: number | null
          last_throttled_at?: string | null
          organization_id?: string
          remaining_quota?: number | null
          reset_at?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_throttle_state_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: true
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_token_state: {
        Row: {
          access_token_vault_name: string | null
          connector_id: string
          expires_at: string | null
          id: string
          instance_url: string | null
          issued_at: string | null
          last_rotated_at: string | null
          organization_id: string
          quarantine_reason: string | null
          quarantined: boolean
          quarantined_at: string | null
          refresh_failure_count: number
          refresh_token_vault_name: string | null
          revoked: boolean
          revoked_at: string | null
          rotation_count: number
          scope: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          access_token_vault_name?: string | null
          connector_id: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          issued_at?: string | null
          last_rotated_at?: string | null
          organization_id: string
          quarantine_reason?: string | null
          quarantined?: boolean
          quarantined_at?: string | null
          refresh_failure_count?: number
          refresh_token_vault_name?: string | null
          revoked?: boolean
          revoked_at?: string | null
          rotation_count?: number
          scope?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          access_token_vault_name?: string | null
          connector_id?: string
          expires_at?: string | null
          id?: string
          instance_url?: string | null
          issued_at?: string | null
          last_rotated_at?: string | null
          organization_id?: string
          quarantine_reason?: string | null
          quarantined?: boolean
          quarantined_at?: string | null
          refresh_failure_count?: number
          refresh_token_vault_name?: string | null
          revoked?: boolean
          revoked_at?: string | null
          rotation_count?: number
          scope?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_token_state_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: true
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_token_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      context_governance_audit: {
        Row: {
          approval_rules_applied: Json
          context_pack: string | null
          created_at: string
          decision_path: Json
          engine_version: string | null
          governance_model: string | null
          governance_profile_id: string | null
          governance_profile_version: number | null
          id: string
          organization_id: string
          risk_profile: string | null
          subject_id: string
          subject_type: string
          thresholds_applied: Json
        }
        Insert: {
          approval_rules_applied?: Json
          context_pack?: string | null
          created_at?: string
          decision_path?: Json
          engine_version?: string | null
          governance_model?: string | null
          governance_profile_id?: string | null
          governance_profile_version?: number | null
          id?: string
          organization_id: string
          risk_profile?: string | null
          subject_id: string
          subject_type: string
          thresholds_applied?: Json
        }
        Update: {
          approval_rules_applied?: Json
          context_pack?: string | null
          created_at?: string
          decision_path?: Json
          engine_version?: string | null
          governance_model?: string | null
          governance_profile_id?: string | null
          governance_profile_version?: number | null
          id?: string
          organization_id?: string
          risk_profile?: string | null
          subject_id?: string
          subject_type?: string
          thresholds_applied?: Json
        }
        Relationships: []
      }
      context_packs: {
        Row: {
          created_at: string
          description: string | null
          executive_views: Json
          governance_defaults: Json
          id: string
          is_locked_default: boolean
          is_system: boolean
          kpi_templates: Json
          name: string
          pack_key: string
          threshold_defaults: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          executive_views?: Json
          governance_defaults?: Json
          id?: string
          is_locked_default?: boolean
          is_system?: boolean
          kpi_templates?: Json
          name: string
          pack_key: string
          threshold_defaults?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          executive_views?: Json
          governance_defaults?: Json
          id?: string
          is_locked_default?: boolean
          is_system?: boolean
          kpi_templates?: Json
          name?: string
          pack_key?: string
          threshold_defaults?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      convergence_usage: {
        Row: {
          call_count: number
          date: string
          id: string
          organization_id: string
        }
        Insert: {
          call_count?: number
          date?: string
          id?: string
          organization_id: string
        }
        Update: {
          call_count?: number
          date?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "convergence_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          organization_id: string
          role: string
          session_id: string
          structured_response: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          organization_id: string
          role: string
          session_id: string
          structured_response?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          session_id?: string
          structured_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "copilot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_sessions: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_usage: {
        Row: {
          call_count: number
          date: string
          id: string
          organization_id: string
        }
        Insert: {
          call_count?: number
          date?: string
          id?: string
          organization_id: string
        }
        Update: {
          call_count?: number
          date?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      counterfactual_analyses: {
        Row: {
          confidence: number | null
          counterfactual_scenario: string
          created_at: string
          entity_id: string
          entity_type: string
          factors_to_change: Json
          id: string
          minimum_changes_required: number | null
          narrative: string | null
          organization_id: string
          original_recommendation: string
          sensitivity_ranking: Json | null
        }
        Insert: {
          confidence?: number | null
          counterfactual_scenario: string
          created_at?: string
          entity_id: string
          entity_type: string
          factors_to_change?: Json
          id?: string
          minimum_changes_required?: number | null
          narrative?: string | null
          organization_id: string
          original_recommendation: string
          sensitivity_ranking?: Json | null
        }
        Update: {
          confidence?: number | null
          counterfactual_scenario?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          factors_to_change?: Json
          id?: string
          minimum_changes_required?: number | null
          narrative?: string | null
          organization_id?: string
          original_recommendation?: string
          sensitivity_ranking?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "counterfactual_analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_run_log: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          job_name: string
          metadata: Json | null
          records_processed: number | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      data_connectors: {
        Row: {
          config: Json
          connector_type: Database["public"]["Enums"]["connector_type"]
          consecutive_failures: number
          created_at: string
          created_by: string
          credential_vault_keys: Json | null
          cursor_field: string | null
          data_source_id: string | null
          dataset_id: string | null
          description: string | null
          health: Database["public"]["Enums"]["connector_health"]
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_synced_at: string | null
          name: string
          organization_id: string
          retry_policy: Json
          status: Database["public"]["Enums"]["connector_status"]
          sync_mode: Database["public"]["Enums"]["connector_sync_mode"]
          updated_at: string
          updated_by: string | null
          vault_secret_name: string | null
          workspace_id: string | null
        }
        Insert: {
          config?: Json
          connector_type: Database["public"]["Enums"]["connector_type"]
          consecutive_failures?: number
          created_at?: string
          created_by: string
          credential_vault_keys?: Json | null
          cursor_field?: string | null
          data_source_id?: string | null
          dataset_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["connector_health"]
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          retry_policy?: Json
          status?: Database["public"]["Enums"]["connector_status"]
          sync_mode?: Database["public"]["Enums"]["connector_sync_mode"]
          updated_at?: string
          updated_by?: string | null
          vault_secret_name?: string | null
          workspace_id?: string | null
        }
        Update: {
          config?: Json
          connector_type?: Database["public"]["Enums"]["connector_type"]
          consecutive_failures?: number
          created_at?: string
          created_by?: string
          credential_vault_keys?: Json | null
          cursor_field?: string | null
          data_source_id?: string | null
          dataset_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["connector_health"]
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          retry_policy?: Json
          status?: Database["public"]["Enums"]["connector_status"]
          sync_mode?: Database["public"]["Enums"]["connector_sync_mode"]
          updated_at?: string
          updated_by?: string | null
          vault_secret_name?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_connectors_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_connectors_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_connectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_connectors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_lineage: {
        Row: {
          confidence_impact: number | null
          created_at: string
          id: string
          organization_id: string
          source_id: string
          source_name: string | null
          source_type: string
          target_id: string
          target_name: string | null
          target_type: string
          transformation: string | null
          transformation_details: Json | null
        }
        Insert: {
          confidence_impact?: number | null
          created_at?: string
          id?: string
          organization_id: string
          source_id: string
          source_name?: string | null
          source_type: string
          target_id: string
          target_name?: string | null
          target_type: string
          transformation?: string | null
          transformation_details?: Json | null
        }
        Update: {
          confidence_impact?: number | null
          created_at?: string
          id?: string
          organization_id?: string
          source_id?: string
          source_name?: string | null
          source_type?: string
          target_id?: string
          target_name?: string | null
          target_type?: string
          transformation?: string | null
          transformation_details?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "data_lineage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_checks: {
        Row: {
          check_type: string
          created_at: string
          dataset_id: string | null
          details: Json | null
          id: string
          organization_id: string
          records_checked: number | null
          records_failed: number | null
          score: number | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          check_type?: string
          created_at?: string
          dataset_id?: string | null
          details?: Json | null
          id?: string
          organization_id: string
          records_checked?: number | null
          records_failed?: number | null
          score?: number | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          check_type?: string
          created_at?: string
          dataset_id?: string | null
          details?: Json | null
          id?: string
          organization_id?: string
          records_checked?: number | null
          records_failed?: number | null
          score?: number | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_checks_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_checks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          auto_cleanup: boolean
          created_at: string
          data_category: string
          description: string | null
          enforcement_status: string
          id: string
          last_cleanup_at: string | null
          next_scheduled_at: string | null
          organization_id: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          auto_cleanup?: boolean
          created_at?: string
          data_category: string
          description?: string | null
          enforcement_status?: string
          id?: string
          last_cleanup_at?: string | null
          next_scheduled_at?: string | null
          organization_id: string
          retention_days?: number
          updated_at?: string
        }
        Update: {
          auto_cleanup?: boolean
          created_at?: string
          data_category?: string
          description?: string | null
          enforcement_status?: string
          id?: string
          last_cleanup_at?: string | null
          next_scheduled_at?: string | null
          organization_id?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          credentials_key_hash: string | null
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by: string
          credentials_key_hash?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          credentials_key_hash?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          data_source_id: string
          error_message: string | null
          id: string
          organization_id: string
          records_synced: number | null
          request_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_source_id: string
          error_message?: string | null
          id?: string
          organization_id: string
          records_synced?: number | null
          request_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_source_id?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          records_synced?: number | null
          request_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sync_jobs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sync_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_versions: {
        Row: {
          change_summary: string | null
          column_mapping: Json | null
          created_at: string
          created_by: string
          dataset_id: string
          file_path: string | null
          id: string
          is_active: boolean
          metadata: Json
          organization_id: string
          row_count: number | null
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          change_summary?: string | null
          column_mapping?: Json | null
          created_at?: string
          created_by: string
          dataset_id: string
          file_path?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          organization_id: string
          row_count?: number | null
          version_number?: number
          workspace_id?: string | null
        }
        Update: {
          change_summary?: string | null
          column_mapping?: Json | null
          created_at?: string
          created_by?: string
          dataset_id?: string
          file_path?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          organization_id?: string
          row_count?: number | null
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_versions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          column_mapping: Json | null
          created_at: string
          current_version: number | null
          data_source_id: string | null
          file_path: string | null
          freshness_policy_hours: number | null
          id: string
          is_stale: boolean | null
          last_refreshed_at: string | null
          layer_type: string
          name: string
          organization_id: string
          owner_user_id: string | null
          provenance: Json | null
          row_count: number | null
          status: string
          steward_user_id: string | null
          uploaded_by: string
          workspace_id: string | null
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          current_version?: number | null
          data_source_id?: string | null
          file_path?: string | null
          freshness_policy_hours?: number | null
          id?: string
          is_stale?: boolean | null
          last_refreshed_at?: string | null
          layer_type?: string
          name: string
          organization_id: string
          owner_user_id?: string | null
          provenance?: Json | null
          row_count?: number | null
          status?: string
          steward_user_id?: string | null
          uploaded_by: string
          workspace_id?: string | null
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          current_version?: number | null
          data_source_id?: string | null
          file_path?: string | null
          freshness_policy_hours?: number | null
          id?: string
          is_stale?: boolean | null
          last_refreshed_at?: string | null
          layer_type?: string
          name?: string
          organization_id?: string
          owner_user_id?: string | null
          provenance?: Json | null
          row_count?: number | null
          status?: string
          steward_user_id?: string | null
          uploaded_by?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasets_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datasets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datasets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_approvals: {
        Row: {
          approver_id: string
          comments: string | null
          decision_id: string
          id: string
          organization_id: string
          requested_at: string
          requested_by: string
          responded_at: string | null
          status: string
          verdict: string | null
        }
        Insert: {
          approver_id: string
          comments?: string | null
          decision_id: string
          id?: string
          organization_id: string
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          status?: string
          verdict?: string | null
        }
        Update: {
          approver_id?: string
          comments?: string | null
          decision_id?: string
          id?: string
          organization_id?: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          status?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_approvals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_comments: {
        Row: {
          content: string
          created_at: string
          decision_id: string
          id: string
          mentions: string[] | null
          organization_id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          decision_id: string
          id?: string
          mentions?: string[] | null
          organization_id: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          decision_id?: string
          id?: string
          mentions?: string[] | null
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_comments_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "decision_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_contexts: {
        Row: {
          created_at: string
          created_by: string | null
          datasets: Json | null
          decision_type: string
          description: string | null
          id: string
          industry: string | null
          name: string
          objective: string | null
          organization_id: string
          status: string
          target_metrics: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          datasets?: Json | null
          decision_type?: string
          description?: string | null
          id?: string
          industry?: string | null
          name: string
          objective?: string | null
          organization_id: string
          status?: string
          target_metrics?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          datasets?: Json | null
          decision_type?: string
          description?: string | null
          id?: string
          industry?: string | null
          name?: string
          objective?: string | null
          organization_id?: string
          status?: string
          target_metrics?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_contexts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_embeddings: {
        Row: {
          content_text: string
          created_at: string
          embedding: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          content_text: string
          created_at?: string
          embedding: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          content_text?: string
          created_at?: string
          embedding?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_embeddings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_enrichment: {
        Row: {
          advisory_id: string | null
          blending_rule: string | null
          client_confidence: number | null
          client_evidence: Json
          combined_interpretation: string | null
          confidence_delta: number | null
          created_at: string
          decision_id: string | null
          enriched_confidence: number | null
          id: string
          internal_context: Json
          organization_id: string
        }
        Insert: {
          advisory_id?: string | null
          blending_rule?: string | null
          client_confidence?: number | null
          client_evidence?: Json
          combined_interpretation?: string | null
          confidence_delta?: number | null
          created_at?: string
          decision_id?: string | null
          enriched_confidence?: number | null
          id?: string
          internal_context?: Json
          organization_id: string
        }
        Update: {
          advisory_id?: string | null
          blending_rule?: string | null
          client_confidence?: number | null
          client_evidence?: Json
          combined_interpretation?: string | null
          confidence_delta?: number | null
          created_at?: string
          decision_id?: string | null
          enriched_confidence?: number | null
          id?: string
          internal_context?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_enrichment_advisory_id_fkey"
            columns: ["advisory_id"]
            isOneToOne: false
            referencedRelation: "advisory_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_enrichment_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_enrichment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_ledger: {
        Row: {
          actual_value: number | null
          advisory_instance_id: string | null
          approval_chain: Json
          baseline_value: number | null
          calibration_error: number | null
          capped_confidence: number | null
          causal_attribution_score: number | null
          chosen_action: string | null
          confidence_at_decision: number | null
          confidence_cap_reason: string | null
          confidence_updated: number | null
          counterfactual_analysis_id: string | null
          counterfactual_delta: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_context_id: string | null
          decision_origin: string
          decision_simulation_id: string | null
          decision_status: string
          decision_type: string
          evidence_sources: Json
          execution_completed_at: string | null
          execution_started_at: string | null
          execution_status: string
          expected_value_at_decision: number | null
          explanation_metadata: Json | null
          governance_context: Json
          governance_profile_id: string | null
          id: string
          is_suppressed: boolean
          kpi_id: string | null
          linked_aicis_prediction_id: string | null
          linked_aicis_recommendation_id: string | null
          model_calibration_adjustment: number | null
          notes: string | null
          organization_id: string
          outcome_delta: number | null
          outcome_measured_at: string | null
          predicted_net_impact: number | null
          predicted_roi_probability: number | null
          prediction_accuracy_score: number | null
          probability_of_success: number | null
          raw_confidence: number | null
          recommendation_logic_type: string | null
          recommended_action: string
          required_approvals: number
          simulation_id: string | null
          source_insight_summary: string | null
          suppression_reason: string | null
          updated_at: string
        }
        Insert: {
          actual_value?: number | null
          advisory_instance_id?: string | null
          approval_chain?: Json
          baseline_value?: number | null
          calibration_error?: number | null
          capped_confidence?: number | null
          causal_attribution_score?: number | null
          chosen_action?: string | null
          confidence_at_decision?: number | null
          confidence_cap_reason?: string | null
          confidence_updated?: number | null
          counterfactual_analysis_id?: string | null
          counterfactual_delta?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_context_id?: string | null
          decision_origin?: string
          decision_simulation_id?: string | null
          decision_status?: string
          decision_type?: string
          evidence_sources?: Json
          execution_completed_at?: string | null
          execution_started_at?: string | null
          execution_status?: string
          expected_value_at_decision?: number | null
          explanation_metadata?: Json | null
          governance_context?: Json
          governance_profile_id?: string | null
          id?: string
          is_suppressed?: boolean
          kpi_id?: string | null
          linked_aicis_prediction_id?: string | null
          linked_aicis_recommendation_id?: string | null
          model_calibration_adjustment?: number | null
          notes?: string | null
          organization_id: string
          outcome_delta?: number | null
          outcome_measured_at?: string | null
          predicted_net_impact?: number | null
          predicted_roi_probability?: number | null
          prediction_accuracy_score?: number | null
          probability_of_success?: number | null
          raw_confidence?: number | null
          recommendation_logic_type?: string | null
          recommended_action: string
          required_approvals?: number
          simulation_id?: string | null
          source_insight_summary?: string | null
          suppression_reason?: string | null
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          advisory_instance_id?: string | null
          approval_chain?: Json
          baseline_value?: number | null
          calibration_error?: number | null
          capped_confidence?: number | null
          causal_attribution_score?: number | null
          chosen_action?: string | null
          confidence_at_decision?: number | null
          confidence_cap_reason?: string | null
          confidence_updated?: number | null
          counterfactual_analysis_id?: string | null
          counterfactual_delta?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_context_id?: string | null
          decision_origin?: string
          decision_simulation_id?: string | null
          decision_status?: string
          decision_type?: string
          evidence_sources?: Json
          execution_completed_at?: string | null
          execution_started_at?: string | null
          execution_status?: string
          expected_value_at_decision?: number | null
          explanation_metadata?: Json | null
          governance_context?: Json
          governance_profile_id?: string | null
          id?: string
          is_suppressed?: boolean
          kpi_id?: string | null
          linked_aicis_prediction_id?: string | null
          linked_aicis_recommendation_id?: string | null
          model_calibration_adjustment?: number | null
          notes?: string | null
          organization_id?: string
          outcome_delta?: number | null
          outcome_measured_at?: string | null
          predicted_net_impact?: number | null
          predicted_roi_probability?: number | null
          prediction_accuracy_score?: number | null
          probability_of_success?: number | null
          raw_confidence?: number | null
          recommendation_logic_type?: string | null
          recommended_action?: string
          required_approvals?: number
          simulation_id?: string | null
          source_insight_summary?: string | null
          suppression_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_ledger_advisory_instance_id_fkey"
            columns: ["advisory_instance_id"]
            isOneToOne: false
            referencedRelation: "advisory_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_counterfactual_analysis_id_fkey"
            columns: ["counterfactual_analysis_id"]
            isOneToOne: false
            referencedRelation: "counterfactual_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_decision_context_id_fkey"
            columns: ["decision_context_id"]
            isOneToOne: false
            referencedRelation: "decision_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_decision_simulation_id_fkey"
            columns: ["decision_simulation_id"]
            isOneToOne: false
            referencedRelation: "decision_simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_linked_aicis_prediction_id_fkey"
            columns: ["linked_aicis_prediction_id"]
            isOneToOne: false
            referencedRelation: "aicis_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_linked_aicis_recommendation_id_fkey"
            columns: ["linked_aicis_recommendation_id"]
            isOneToOne: false
            referencedRelation: "aicis_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ledger_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulation_results"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_outcomes: {
        Row: {
          accuracy_score: number | null
          created_at: string
          dataset_id: string | null
          decision_id: string
          evaluation_date: string | null
          evaluation_window_days: number
          expected_change: number | null
          expected_direction: string
          expected_metric: string
          id: string
          notes: string | null
          observed_metric: string | null
          observed_value_after: number | null
          observed_value_before: number | null
          organization_id: string
          outcome_status: string
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string
          dataset_id?: string | null
          decision_id: string
          evaluation_date?: string | null
          evaluation_window_days?: number
          expected_change?: number | null
          expected_direction?: string
          expected_metric: string
          id?: string
          notes?: string | null
          observed_metric?: string | null
          observed_value_after?: number | null
          observed_value_before?: number | null
          organization_id: string
          outcome_status?: string
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string
          dataset_id?: string | null
          decision_id?: string
          evaluation_date?: string | null
          evaluation_window_days?: number
          expected_change?: number | null
          expected_direction?: string
          expected_metric?: string
          id?: string
          notes?: string | null
          observed_metric?: string | null
          observed_value_after?: number | null
          observed_value_before?: number | null
          organization_id?: string
          outcome_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_outcomes_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcomes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_outcomes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_replays: {
        Row: {
          confidence_drift: number | null
          created_at: string
          current_data_summary: Json | null
          decision_id: string
          id: string
          organization_id: string
          original_confidence: number | null
          original_recommendation: string | null
          recommendation_changed: boolean | null
          replay_narrative: string | null
          replayed_by: string
          replayed_confidence: number | null
          replayed_recommendation: string | null
        }
        Insert: {
          confidence_drift?: number | null
          created_at?: string
          current_data_summary?: Json | null
          decision_id: string
          id?: string
          organization_id: string
          original_confidence?: number | null
          original_recommendation?: string | null
          recommendation_changed?: boolean | null
          replay_narrative?: string | null
          replayed_by: string
          replayed_confidence?: number | null
          replayed_recommendation?: string | null
        }
        Update: {
          confidence_drift?: number | null
          created_at?: string
          current_data_summary?: Json | null
          decision_id?: string
          id?: string
          organization_id?: string
          original_confidence?: number | null
          original_recommendation?: string | null
          recommendation_changed?: boolean | null
          replay_narrative?: string | null
          replayed_by?: string
          replayed_confidence?: number | null
          replayed_recommendation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_replays_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_replays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_rules: {
        Row: {
          actions: Json
          condition_type: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          hit_policy: string
          id: string
          is_active: boolean
          is_shadow: boolean
          name: string
          organization_id: string
          priority: number
          updated_at: string
          version: number
        }
        Insert: {
          actions?: Json
          condition_type?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          hit_policy?: string
          id?: string
          is_active?: boolean
          is_shadow?: boolean
          name: string
          organization_id: string
          priority?: number
          updated_at?: string
          version?: number
        }
        Update: {
          actions?: Json
          condition_type?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          hit_policy?: string
          id?: string
          is_active?: boolean
          is_shadow?: boolean
          name?: string
          organization_id?: string
          priority?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_shadow_log: {
        Row: {
          advisory_instance_id: string | null
          created_at: string
          discrepancy_detected: boolean
          id: string
          organization_id: string
          production_decision_id: string | null
          rule_id: string
          rule_version: number
          shadow_decision: Json
          would_have_created: boolean
        }
        Insert: {
          advisory_instance_id?: string | null
          created_at?: string
          discrepancy_detected?: boolean
          id?: string
          organization_id: string
          production_decision_id?: string | null
          rule_id: string
          rule_version: number
          shadow_decision?: Json
          would_have_created?: boolean
        }
        Update: {
          advisory_instance_id?: string | null
          created_at?: string
          discrepancy_detected?: boolean
          id?: string
          organization_id?: string
          production_decision_id?: string | null
          rule_id?: string
          rule_version?: number
          shadow_decision?: Json
          would_have_created?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "decision_shadow_log_advisory_instance_id_fkey"
            columns: ["advisory_instance_id"]
            isOneToOne: false
            referencedRelation: "advisory_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_shadow_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_shadow_log_production_decision_id_fkey"
            columns: ["production_decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_shadow_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "decision_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_simulations: {
        Row: {
          actual_net_impact: number | null
          calibration_delta: number | null
          capped_confidence: number | null
          churn_change_pct: number | null
          confidence_cap_reason: string | null
          correlation_assumptions: Json | null
          cost_delta_pct: number | null
          created_at: string
          created_by: string | null
          data_sufficiency: string | null
          decision_id: string | null
          expected_net_impact: number | null
          id: string
          implementation_cost: number | null
          measured_at: string | null
          median_net_impact: number | null
          model_version: number | null
          organization_id: string
          p10_impact: number | null
          p50_impact: number | null
          p90_impact: number | null
          probability_cashflow_stress: number | null
          probability_positive_roi: number | null
          raw_confidence: number | null
          revenue_delta_pct: number | null
          risk_adjusted_expected_value: number | null
          sample_size: number | null
          simulation_runs: number | null
          time_to_impact_months: number | null
          variance_score: number | null
        }
        Insert: {
          actual_net_impact?: number | null
          calibration_delta?: number | null
          capped_confidence?: number | null
          churn_change_pct?: number | null
          confidence_cap_reason?: string | null
          correlation_assumptions?: Json | null
          cost_delta_pct?: number | null
          created_at?: string
          created_by?: string | null
          data_sufficiency?: string | null
          decision_id?: string | null
          expected_net_impact?: number | null
          id?: string
          implementation_cost?: number | null
          measured_at?: string | null
          median_net_impact?: number | null
          model_version?: number | null
          organization_id: string
          p10_impact?: number | null
          p50_impact?: number | null
          p90_impact?: number | null
          probability_cashflow_stress?: number | null
          probability_positive_roi?: number | null
          raw_confidence?: number | null
          revenue_delta_pct?: number | null
          risk_adjusted_expected_value?: number | null
          sample_size?: number | null
          simulation_runs?: number | null
          time_to_impact_months?: number | null
          variance_score?: number | null
        }
        Update: {
          actual_net_impact?: number | null
          calibration_delta?: number | null
          capped_confidence?: number | null
          churn_change_pct?: number | null
          confidence_cap_reason?: string | null
          correlation_assumptions?: Json | null
          cost_delta_pct?: number | null
          created_at?: string
          created_by?: string | null
          data_sufficiency?: string | null
          decision_id?: string | null
          expected_net_impact?: number | null
          id?: string
          implementation_cost?: number | null
          measured_at?: string | null
          median_net_impact?: number | null
          model_version?: number | null
          organization_id?: string
          p10_impact?: number | null
          p50_impact?: number | null
          p90_impact?: number | null
          probability_cashflow_stress?: number | null
          probability_positive_roi?: number | null
          raw_confidence?: number | null
          revenue_delta_pct?: number | null
          risk_adjusted_expected_value?: number | null
          sample_size?: number | null
          simulation_runs?: number | null
          time_to_impact_months?: number | null
          variance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_simulations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_simulations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      embed_tokens: {
        Row: {
          allowed_metrics: Json | null
          created_at: string | null
          created_by: string
          dashboard_type: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          token: string
        }
        Insert: {
          allowed_metrics?: Json | null
          created_at?: string | null
          created_by: string
          dashboard_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          token?: string
        }
        Update: {
          allowed_metrics?: Json | null
          created_at?: string | null
          created_by?: string
          dashboard_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_leads: {
        Row: {
          company: string
          company_size: string | null
          created_at: string
          estimated_seats: number | null
          full_name: string
          id: string
          notes: string | null
          source: string | null
          status: string
          updated_at: string
          use_case: string | null
          work_email: string
        }
        Insert: {
          company: string
          company_size?: string | null
          created_at?: string
          estimated_seats?: number | null
          full_name: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          use_case?: string | null
          work_email: string
        }
        Update: {
          company?: string
          company_size?: string | null
          created_at?: string
          estimated_seats?: number | null
          full_name?: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          use_case?: string | null
          work_email?: string
        }
        Relationships: []
      }
      entity_match_functions: {
        Row: {
          attribute_path: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          match_kind: string
          name: string
          organization_id: string
          threshold: number | null
          updated_at: string
          weight: number
        }
        Insert: {
          attribute_path: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_kind: string
          name: string
          organization_id: string
          threshold?: number | null
          updated_at?: string
          weight?: number
        }
        Update: {
          attribute_path?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_kind?: string
          name?: string
          organization_id?: string
          threshold?: number | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_match_functions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          execution_plan_id: string
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          execution_plan_id: string
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          execution_plan_id?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_events_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_interventions: {
        Row: {
          auto_triggered: boolean
          corrective_action: string | null
          created_at: string
          escalated_to: string | null
          execution_plan_id: string
          id: string
          intervention_type: string
          new_owner: string | null
          organization_id: string
          previous_owner: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          auto_triggered?: boolean
          corrective_action?: string | null
          created_at?: string
          escalated_to?: string | null
          execution_plan_id: string
          id?: string
          intervention_type?: string
          new_owner?: string | null
          organization_id: string
          previous_owner?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          trigger_reason: string
          updated_at?: string
        }
        Update: {
          auto_triggered?: boolean
          corrective_action?: string | null
          created_at?: string
          escalated_to?: string | null
          execution_plan_id?: string
          id?: string
          intervention_type?: string
          new_owner?: string | null
          organization_id?: string
          previous_owner?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_interventions_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_interventions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_overrides: {
        Row: {
          actor_id: string
          created_at: string
          execution_plan_id: string
          id: string
          new_state: Json
          organization_id: string
          override_type: string
          previous_state: Json
          reason: string
          requires_step_up: boolean | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          execution_plan_id: string
          id?: string
          new_state: Json
          organization_id: string
          override_type: string
          previous_state: Json
          reason: string
          requires_step_up?: boolean | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          execution_plan_id?: string
          id?: string
          new_state?: Json
          organization_id?: string
          override_type?: string
          previous_state?: Json
          reason?: string
          requires_step_up?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_overrides_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_plans: {
        Row: {
          action_description: string | null
          action_title: string
          blocked_by_plan_id: string | null
          created_at: string
          deadline: string | null
          decision_id: string
          dependency_type: string | null
          id: string
          is_critical_path: boolean | null
          organization_id: string
          owner_user_id: string | null
          priority: string
          status: string
          trigger_config: Json | null
          trigger_type: string | null
          unlocks_plan_ids: string[] | null
          updated_at: string
        }
        Insert: {
          action_description?: string | null
          action_title: string
          blocked_by_plan_id?: string | null
          created_at?: string
          deadline?: string | null
          decision_id: string
          dependency_type?: string | null
          id?: string
          is_critical_path?: boolean | null
          organization_id: string
          owner_user_id?: string | null
          priority?: string
          status?: string
          trigger_config?: Json | null
          trigger_type?: string | null
          unlocks_plan_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          action_description?: string | null
          action_title?: string
          blocked_by_plan_id?: string | null
          created_at?: string
          deadline?: string | null
          decision_id?: string
          dependency_type?: string | null
          id?: string
          is_critical_path?: boolean | null
          organization_id?: string
          owner_user_id?: string | null
          priority?: string
          status?: string
          trigger_config?: Json | null
          trigger_type?: string | null
          unlocks_plan_ids?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plans_blocked_by_plan_id_fkey"
            columns: ["blocked_by_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plans_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_predictions: {
        Row: {
          created_at: string
          delay_days_predicted: number | null
          execution_plan_id: string
          feature_summary: Json | null
          generated_at: string
          id: string
          is_active: boolean
          model_version: number | null
          organization_id: string
          predicted_outcome: string
          recommendation: string | null
          risk_factors: Json | null
          risk_score: number
          run_id: string | null
          superseded_at: string | null
          superseded_by_run_id: string | null
        }
        Insert: {
          created_at?: string
          delay_days_predicted?: number | null
          execution_plan_id: string
          feature_summary?: Json | null
          generated_at?: string
          id?: string
          is_active?: boolean
          model_version?: number | null
          organization_id: string
          predicted_outcome?: string
          recommendation?: string | null
          risk_factors?: Json | null
          risk_score?: number
          run_id?: string | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
        }
        Update: {
          created_at?: string
          delay_days_predicted?: number | null
          execution_plan_id?: string
          feature_summary?: Json | null
          generated_at?: string
          id?: string
          is_active?: boolean
          model_version?: number | null
          organization_id?: string
          predicted_outcome?: string
          recommendation?: string | null
          risk_factors?: Json | null
          risk_score?: number
          run_id?: string | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_predictions_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_run_log: {
        Row: {
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          items_created: number | null
          items_processed: number | null
          metadata: Json | null
          organization_id: string
          run_id: string
          run_type: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          metadata?: Json | null
          organization_id: string
          run_id?: string
          run_type: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          metadata?: Json | null
          organization_id?: string
          run_id?: string
          run_type?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_run_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_scores: {
        Row: {
          avg_delay_days: number | null
          computed_at: string
          computed_by: string | null
          created_at: string
          failure_rate: number | null
          formula_snapshot: string | null
          id: string
          organization_id: string
          plans_evaluated: number | null
          reliability_rate: number | null
          scope_id: string
          scope_type: string
          score: number
          score_explanation: Json | null
          scoring_model_version: number | null
          source_window_days: number | null
          success_rate: number | null
        }
        Insert: {
          avg_delay_days?: number | null
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          failure_rate?: number | null
          formula_snapshot?: string | null
          id?: string
          organization_id: string
          plans_evaluated?: number | null
          reliability_rate?: number | null
          scope_id: string
          scope_type?: string
          score?: number
          score_explanation?: Json | null
          scoring_model_version?: number | null
          source_window_days?: number | null
          success_rate?: number | null
        }
        Update: {
          avg_delay_days?: number | null
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          failure_rate?: number | null
          formula_snapshot?: string | null
          id?: string
          organization_id?: string
          plans_evaluated?: number | null
          reliability_rate?: number | null
          scope_id?: string
          scope_type?: string
          score?: number
          score_explanation?: Json | null
          scoring_model_version?: number | null
          source_window_days?: number | null
          success_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_alerts: {
        Row: {
          created_at: string
          id: string
          kpi_id: string | null
          metric_type: string | null
          notification_channel: string | null
          notified_at: string | null
          organization_id: string
          resolved_at: string | null
          role_type: string
          severity: string
          status: string
          threshold_value: number | null
          title: string
          trigger_value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_id?: string | null
          metric_type?: string | null
          notification_channel?: string | null
          notified_at?: string | null
          organization_id: string
          resolved_at?: string | null
          role_type: string
          severity?: string
          status?: string
          threshold_value?: number | null
          title: string
          trigger_value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kpi_id?: string | null
          metric_type?: string | null
          notification_channel?: string | null
          notified_at?: string | null
          organization_id?: string
          resolved_at?: string | null
          role_type?: string
          severity?: string
          status?: string
          threshold_value?: number | null
          title?: string
          trigger_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "executive_alerts_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executive_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_briefs: {
        Row: {
          generated_at: string
          generated_by: string
          id: string
          organization_id: string
          risk_score: number | null
          role_type: string
          summary_json: Json
        }
        Insert: {
          generated_at?: string
          generated_by?: string
          id?: string
          organization_id: string
          risk_score?: number | null
          role_type: string
          summary_json?: Json
        }
        Update: {
          generated_at?: string
          generated_by?: string
          id?: string
          organization_id?: string
          risk_score?: number | null
          role_type?: string
          summary_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "executive_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_conflicts: {
        Row: {
          created_at: string
          description: string
          id: string
          organization_id: string
          resolved_at: string | null
          role_1: string
          role_2: string
          rule_triggered: string
          severity: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          organization_id: string
          resolved_at?: string | null
          role_1: string
          role_2: string
          rule_triggered: string
          severity?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          resolved_at?: string | null
          role_1?: string
          role_2?: string
          rule_triggered?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_conflicts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_convergence_index: {
        Row: {
          alignment_status: string
          conflict_penalty: number
          created_at: string
          dispersion: number
          id: string
          organization_id: string
          score: number
          volatility_divergence: number
        }
        Insert: {
          alignment_status?: string
          conflict_penalty?: number
          created_at?: string
          dispersion?: number
          id?: string
          organization_id: string
          score?: number
          volatility_divergence?: number
        }
        Update: {
          alignment_status?: string
          conflict_penalty?: number
          created_at?: string
          dispersion?: number
          id?: string
          organization_id?: string
          score?: number
          volatility_divergence?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_convergence_index_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_cross_domain_narratives: {
        Row: {
          affected_domains: string[]
          combined_pressure_score: number
          expires_at: string | null
          generated_at: string
          id: string
          metadata: Json
          narrative: string
          narrative_strength: number
          organization_id: string
          projected_window_days: number | null
          supporting_signal_ids: string[]
        }
        Insert: {
          affected_domains?: string[]
          combined_pressure_score?: number
          expires_at?: string | null
          generated_at?: string
          id?: string
          metadata?: Json
          narrative: string
          narrative_strength?: number
          organization_id: string
          projected_window_days?: number | null
          supporting_signal_ids?: string[]
        }
        Update: {
          affected_domains?: string[]
          combined_pressure_score?: number
          expires_at?: string | null
          generated_at?: string
          id?: string
          metadata?: Json
          narrative?: string
          narrative_strength?: number
          organization_id?: string
          projected_window_days?: number | null
          supporting_signal_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "executive_cross_domain_narratives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_exposure_snapshots: {
        Row: {
          computed_at: string
          dependency_graph: Json
          entity_exposure: Json
          exposure_reasoning: string | null
          exposure_score: number
          geography_exposure: Json
          id: string
          organization_id: string
          sector_exposure: Json
          supplier_exposure: Json
        }
        Insert: {
          computed_at?: string
          dependency_graph?: Json
          entity_exposure?: Json
          exposure_reasoning?: string | null
          exposure_score?: number
          geography_exposure?: Json
          id?: string
          organization_id: string
          sector_exposure?: Json
          supplier_exposure?: Json
        }
        Update: {
          computed_at?: string
          dependency_graph?: Json
          entity_exposure?: Json
          exposure_reasoning?: string | null
          exposure_score?: number
          geography_exposure?: Json
          id?: string
          organization_id?: string
          sector_exposure?: Json
          supplier_exposure?: Json
        }
        Relationships: [
          {
            foreignKeyName: "executive_exposure_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_intel_observability: {
        Row: {
          advisory_adoption_rate: number
          avg_response_latency_hours: number
          computed_at: string
          id: string
          intervention_resolution_rate: number
          items_to_decision_rate: number
          memory_effectiveness_score: number
          organization_id: string
          snapshot_day: string
          unresolved_critical_pressure: number
        }
        Insert: {
          advisory_adoption_rate?: number
          avg_response_latency_hours?: number
          computed_at?: string
          id?: string
          intervention_resolution_rate?: number
          items_to_decision_rate?: number
          memory_effectiveness_score?: number
          organization_id: string
          snapshot_day?: string
          unresolved_critical_pressure?: number
        }
        Update: {
          advisory_adoption_rate?: number
          avg_response_latency_hours?: number
          computed_at?: string
          id?: string
          intervention_resolution_rate?: number
          items_to_decision_rate?: number
          memory_effectiveness_score?: number
          organization_id?: string
          snapshot_day?: string
          unresolved_critical_pressure?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_intel_observability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_intelligence_snapshots: {
        Row: {
          brief_id: string | null
          confidence: number | null
          conversion_metrics: Json
          cross_domain_narratives: Json
          emerging_threats: Json
          fatigue_warning: Json
          generated_at: string
          generated_by: string
          headline: string | null
          id: string
          organization_id: string
          pressure_queue: Json
          provenance: Json
          recommended_actions: Json
          risk_score: number | null
          snapshot_date: string
          summary_json: Json
          top_interventions: Json
        }
        Insert: {
          brief_id?: string | null
          confidence?: number | null
          conversion_metrics?: Json
          cross_domain_narratives?: Json
          emerging_threats?: Json
          fatigue_warning?: Json
          generated_at?: string
          generated_by?: string
          headline?: string | null
          id?: string
          organization_id: string
          pressure_queue?: Json
          provenance?: Json
          recommended_actions?: Json
          risk_score?: number | null
          snapshot_date?: string
          summary_json?: Json
          top_interventions?: Json
        }
        Update: {
          brief_id?: string | null
          confidence?: number | null
          conversion_metrics?: Json
          cross_domain_narratives?: Json
          emerging_threats?: Json
          fatigue_warning?: Json
          generated_at?: string
          generated_by?: string
          headline?: string | null
          id?: string
          organization_id?: string
          pressure_queue?: Json
          provenance?: Json
          recommended_actions?: Json
          risk_score?: number | null
          snapshot_date?: string
          summary_json?: Json
          top_interventions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "executive_intelligence_snapshots_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "executive_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_interventions: {
        Row: {
          acknowledged_at: string | null
          acted_at: string | null
          assigned_at: string | null
          business_impact: number
          contributing_signals: Json
          created_at: string
          decision_id: string | null
          decision_pressure_score: number
          escalation_count: number
          escalation_tier: Database["public"]["Enums"]["intervention_tier"]
          execution_plan_id: string | null
          generated_at: string
          id: string
          intervention_priority_score: number
          intervention_type: string
          last_escalated_at: string | null
          metadata: Json
          organization_id: string
          organizational_exposure: number
          outcome_score: number | null
          owner_id: string | null
          rationale: string | null
          recommended_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          scoring_breakdown: Json
          scoring_version: number
          severity: string
          sla_due_at: string | null
          source_id: string | null
          source_type: string
          status: Database["public"]["Enums"]["intervention_status"]
          summary: string | null
          title: string
          uncertainty_score: number
          updated_at: string
          urgency: string
        }
        Insert: {
          acknowledged_at?: string | null
          acted_at?: string | null
          assigned_at?: string | null
          business_impact?: number
          contributing_signals?: Json
          created_at?: string
          decision_id?: string | null
          decision_pressure_score?: number
          escalation_count?: number
          escalation_tier?: Database["public"]["Enums"]["intervention_tier"]
          execution_plan_id?: string | null
          generated_at?: string
          id?: string
          intervention_priority_score?: number
          intervention_type: string
          last_escalated_at?: string | null
          metadata?: Json
          organization_id: string
          organizational_exposure?: number
          outcome_score?: number | null
          owner_id?: string | null
          rationale?: string | null
          recommended_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          scoring_breakdown?: Json
          scoring_version?: number
          severity?: string
          sla_due_at?: string | null
          source_id?: string | null
          source_type: string
          status?: Database["public"]["Enums"]["intervention_status"]
          summary?: string | null
          title: string
          uncertainty_score?: number
          updated_at?: string
          urgency?: string
        }
        Update: {
          acknowledged_at?: string | null
          acted_at?: string | null
          assigned_at?: string | null
          business_impact?: number
          contributing_signals?: Json
          created_at?: string
          decision_id?: string | null
          decision_pressure_score?: number
          escalation_count?: number
          escalation_tier?: Database["public"]["Enums"]["intervention_tier"]
          execution_plan_id?: string | null
          generated_at?: string
          id?: string
          intervention_priority_score?: number
          intervention_type?: string
          last_escalated_at?: string | null
          metadata?: Json
          organization_id?: string
          organizational_exposure?: number
          outcome_score?: number | null
          owner_id?: string | null
          rationale?: string | null
          recommended_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          scoring_breakdown?: Json
          scoring_version?: number
          severity?: string
          sla_due_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["intervention_status"]
          summary?: string | null
          title?: string
          uncertainty_score?: number
          updated_at?: string
          urgency?: string
        }
        Relationships: []
      }
      executive_modes: {
        Row: {
          alert_thresholds: Json
          created_at: string
          id: string
          organization_id: string
          priority_kpis: Json
          role_type: string
          updated_at: string
        }
        Insert: {
          alert_thresholds?: Json
          created_at?: string
          id?: string
          organization_id: string
          priority_kpis?: Json
          role_type: string
          updated_at?: string
        }
        Update: {
          alert_thresholds?: Json
          created_at?: string
          id?: string
          organization_id?: string
          priority_kpis?: Json
          role_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_modes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_risk_index: {
        Row: {
          components: Json
          created_at: string
          escalation_reason: string | null
          escalation_required: boolean
          id: string
          last_notified_at: string | null
          last_updated: string
          organization_id: string
          role_type: string
          score: number
        }
        Insert: {
          components?: Json
          created_at?: string
          escalation_reason?: string | null
          escalation_required?: boolean
          id?: string
          last_notified_at?: string | null
          last_updated?: string
          organization_id: string
          role_type: string
          score?: number
        }
        Update: {
          components?: Json
          created_at?: string
          escalation_reason?: string | null
          escalation_required?: boolean
          id?: string
          last_notified_at?: string | null
          last_updated?: string
          organization_id?: string
          role_type?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_risk_index_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_data_sources: {
        Row: {
          category: string
          config: Json
          created_at: string
          endpoint_url: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_refreshed_at: string | null
          license_type: string | null
          license_url: string | null
          next_refresh_at: string | null
          organization_id: string | null
          refresh_interval_hours: number
          trust_level: number
          updated_at: string
          vendor_key: string
          vendor_name: string
        }
        Insert: {
          category?: string
          config?: Json
          created_at?: string
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          license_type?: string | null
          license_url?: string | null
          next_refresh_at?: string | null
          organization_id?: string | null
          refresh_interval_hours?: number
          trust_level?: number
          updated_at?: string
          vendor_key: string
          vendor_name: string
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          license_type?: string | null
          license_url?: string | null
          next_refresh_at?: string | null
          organization_id?: string | null
          refresh_interval_hours?: number
          trust_level?: number
          updated_at?: string
          vendor_key?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_data_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_signals: {
        Row: {
          data: Json
          dataset_id: string | null
          expires_at: string | null
          fetched_at: string
          id: string
          organization_id: string
          relevance_score: number | null
          signal_type: string
          source: string
        }
        Insert: {
          data?: Json
          dataset_id?: string | null
          expires_at?: string | null
          fetched_at?: string
          id?: string
          organization_id: string
          relevance_score?: number | null
          signal_type: string
          source: string
        }
        Update: {
          data?: Json
          dataset_id?: string | null
          expires_at?: string | null
          fetched_at?: string
          id?: string
          organization_id?: string
          relevance_score?: number | null
          signal_type?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_signals_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sync_runs: {
        Row: {
          actor: string | null
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json
          organization_id: string | null
          pages_fetched: number
          rows_fetched: number
          rows_upserted: number
          source_id: string | null
          started_at: string
          status: string
          trigger: string
          vendor_key: string
        }
        Insert: {
          actor?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          pages_fetched?: number
          rows_fetched?: number
          rows_upserted?: number
          source_id?: string | null
          started_at?: string
          status?: string
          trigger?: string
          vendor_key: string
        }
        Update: {
          actor?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          pages_fetched?: number
          rows_fetched?: number
          rows_upserted?: number
          source_id?: string | null
          started_at?: string
          status?: string
          trigger?: string
          vendor_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_sync_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fairness_assessments: {
        Row: {
          assessment_status: string
          created_at: string
          created_by: string | null
          dataset_id: string | null
          decision_id: string | null
          disparate_impact_ratio: number | null
          group_a_label: string
          group_a_value: number | null
          group_b_label: string
          group_b_value: number | null
          id: string
          metric_name: string
          organization_id: string
          protected_attribute: string
          remediation_notes: string | null
          statistical_parity_diff: number | null
        }
        Insert: {
          assessment_status?: string
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          decision_id?: string | null
          disparate_impact_ratio?: number | null
          group_a_label: string
          group_a_value?: number | null
          group_b_label: string
          group_b_value?: number | null
          id?: string
          metric_name: string
          organization_id: string
          protected_attribute: string
          remediation_notes?: string | null
          statistical_parity_diff?: number | null
        }
        Update: {
          assessment_status?: string
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          decision_id?: string | null
          disparate_impact_ratio?: number | null
          group_a_label?: string
          group_a_value?: number | null
          group_b_label?: string
          group_b_value?: number | null
          id?: string
          metric_name?: string
          organization_id?: string
          protected_attribute?: string
          remediation_notes?: string | null
          statistical_parity_diff?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fairness_assessments_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fairness_assessments_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fairness_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_results: {
        Row: {
          confidence_interval: number | null
          created_by: string
          dataset_id: string | null
          forecast_horizon_months: number
          generated_at: string
          id: string
          mape: number | null
          metric_type: string
          model_used: string
          organization_id: string
          predictions: Json
          seasonality_detected: boolean | null
          trend_direction: string | null
        }
        Insert: {
          confidence_interval?: number | null
          created_by: string
          dataset_id?: string | null
          forecast_horizon_months?: number
          generated_at?: string
          id?: string
          mape?: number | null
          metric_type: string
          model_used?: string
          organization_id: string
          predictions?: Json
          seasonality_detected?: boolean | null
          trend_direction?: string | null
        }
        Update: {
          confidence_interval?: number | null
          created_by?: string
          dataset_id?: string | null
          forecast_horizon_months?: number
          generated_at?: string
          id?: string
          mape?: number | null
          metric_type?: string
          model_used?: string
          organization_id?: string
          predictions?: Json
          seasonality_detected?: boolean | null
          trend_direction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_results_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fusion_observability: {
        Row: {
          avg_generation_latency_ms: number
          clusters_count: number
          compression_ratio: number
          created_at: string
          day: string
          duplicates_suppressed: number
          executive_interactions: number
          id: string
          ignored_narrative_pct: number
          inputs_count: number
          metadata: Json
          narrative_resolution_effectiveness_pct: number
          narrative_to_decision_conversion_pct: number
          organization_id: string
        }
        Insert: {
          avg_generation_latency_ms?: number
          clusters_count?: number
          compression_ratio?: number
          created_at?: string
          day?: string
          duplicates_suppressed?: number
          executive_interactions?: number
          id?: string
          ignored_narrative_pct?: number
          inputs_count?: number
          metadata?: Json
          narrative_resolution_effectiveness_pct?: number
          narrative_to_decision_conversion_pct?: number
          organization_id: string
        }
        Update: {
          avg_generation_latency_ms?: number
          clusters_count?: number
          compression_ratio?: number
          created_at?: string
          day?: string
          duplicates_suppressed?: number
          executive_interactions?: number
          id?: string
          ignored_narrative_pct?: number
          inputs_count?: number
          metadata?: Json
          narrative_resolution_effectiveness_pct?: number
          narrative_to_decision_conversion_pct?: number
          organization_id?: string
        }
        Relationships: []
      }
      gdpr_requests: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          honeypot_triggered: boolean
          hour_bucket: number
          id: string
          message: string | null
          organization_context: string | null
          request_type: string
          requester_email: string
          source_ip: unknown
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          honeypot_triggered?: boolean
          hour_bucket?: number
          id?: string
          message?: string | null
          organization_context?: string | null
          request_type: string
          requester_email: string
          source_ip?: unknown
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          honeypot_triggered?: boolean
          hour_bucket?: number
          id?: string
          message?: string | null
          organization_context?: string | null
          request_type?: string
          requester_email?: string
          source_ip?: unknown
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      governance_maturity_assessments: {
        Row: {
          assessed_by: string
          created_at: string
          dimensions: Json
          id: string
          organization_id: string
          overall_score: number
          recommendations: Json | null
        }
        Insert: {
          assessed_by: string
          created_at?: string
          dimensions?: Json
          id?: string
          organization_id: string
          overall_score?: number
          recommendations?: Json | null
        }
        Update: {
          assessed_by?: string
          created_at?: string
          dimensions?: Json
          id?: string
          organization_id?: string
          overall_score?: number
          recommendations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_maturity_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_profiles: {
        Row: {
          advisory_threshold: number
          change_reason: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          escalation_threshold: number
          governance_confidence_ceiling: number
          governance_confidence_floor: number
          governance_model: string
          id: string
          intervention_threshold: number
          organization_id: string
          risk_appetite: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          advisory_threshold?: number
          change_reason?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          escalation_threshold?: number
          governance_confidence_ceiling?: number
          governance_confidence_floor?: number
          governance_model?: string
          id?: string
          intervention_threshold?: number
          organization_id: string
          risk_appetite?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          advisory_threshold?: number
          change_reason?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          escalation_threshold?: number
          governance_confidence_ceiling?: number
          governance_confidence_floor?: number
          governance_model?: string
          id?: string
          intervention_threshold?: number
          organization_id?: string
          risk_appetite?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      governance_thresholds: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          source: string
          source_ref: string | null
          threshold_key: string
          threshold_value: number
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          source?: string
          source_ref?: string | null
          threshold_key: string
          threshold_value: number
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          source?: string
          source_ref?: string | null
          threshold_key?: string
          threshold_value?: number
          updated_by?: string | null
        }
        Relationships: []
      }
      graph_attention_views: {
        Row: {
          abstraction_level: number
          compressed_summary: string
          expires_at: string
          generated_at: string
          id: string
          organization_id: string
          persona: string
          priority_score: number
          supporting_edges: Json
          supporting_nodes: Json
          title: string
        }
        Insert: {
          abstraction_level?: number
          compressed_summary: string
          expires_at?: string
          generated_at?: string
          id?: string
          organization_id: string
          persona: string
          priority_score?: number
          supporting_edges?: Json
          supporting_nodes?: Json
          title: string
        }
        Update: {
          abstraction_level?: number
          compressed_summary?: string
          expires_at?: string
          generated_at?: string
          id?: string
          organization_id?: string
          persona?: string
          priority_score?: number
          supporting_edges?: Json
          supporting_nodes?: Json
          title?: string
        }
        Relationships: []
      }
      graph_governance_events: {
        Row: {
          actor: string
          created_at: string
          edge_id: string | null
          escalation_threshold_breached: boolean
          event_type: string
          id: string
          new_state: Json
          node_id: string | null
          organization_id: string
          prior_state: Json
          reason: string | null
          threshold_kind: string | null
          threshold_value: number | null
        }
        Insert: {
          actor?: string
          created_at?: string
          edge_id?: string | null
          escalation_threshold_breached?: boolean
          event_type: string
          id?: string
          new_state?: Json
          node_id?: string | null
          organization_id: string
          prior_state?: Json
          reason?: string | null
          threshold_kind?: string | null
          threshold_value?: number | null
        }
        Update: {
          actor?: string
          created_at?: string
          edge_id?: string | null
          escalation_threshold_breached?: boolean
          event_type?: string
          id?: string
          new_state?: Json
          node_id?: string | null
          organization_id?: string
          prior_state?: Json
          reason?: string | null
          threshold_kind?: string | null
          threshold_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "graph_governance_events_edge_id_fkey"
            columns: ["edge_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_governance_events_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_memory_patterns: {
        Row: {
          created_at: string
          historical_effectiveness: number | null
          historical_outcomes: Json
          id: string
          last_seen_at: string
          organization_id: string
          pattern_signature: string
          pattern_type: string
          recurrence_frequency: number
          recurring_path: Json
        }
        Insert: {
          created_at?: string
          historical_effectiveness?: number | null
          historical_outcomes?: Json
          id?: string
          last_seen_at?: string
          organization_id: string
          pattern_signature: string
          pattern_type: string
          recurrence_frequency?: number
          recurring_path?: Json
        }
        Update: {
          created_at?: string
          historical_effectiveness?: number | null
          historical_outcomes?: Json
          id?: string
          last_seen_at?: string
          organization_id?: string
          pattern_signature?: string
          pattern_type?: string
          recurrence_frequency?: number
          recurring_path?: Json
        }
        Relationships: []
      }
      graph_observability: {
        Row: {
          compression_ratio: number
          conflict_count: number
          day: string
          edges_created: number
          graph_density: number
          id: string
          nodes_created: number
          organization_id: string
          propagation_paths: number
          reasoning_chain_count: number
          recurring_pattern_count: number
          topology_compute_ms: number
          updated_at: string
        }
        Insert: {
          compression_ratio?: number
          conflict_count?: number
          day?: string
          edges_created?: number
          graph_density?: number
          id?: string
          nodes_created?: number
          organization_id: string
          propagation_paths?: number
          reasoning_chain_count?: number
          recurring_pattern_count?: number
          topology_compute_ms?: number
          updated_at?: string
        }
        Update: {
          compression_ratio?: number
          conflict_count?: number
          day?: string
          edges_created?: number
          graph_density?: number
          id?: string
          nodes_created?: number
          organization_id?: string
          propagation_paths?: number
          reasoning_chain_count?: number
          recurring_pattern_count?: number
          topology_compute_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      graph_snapshot_versions: {
        Row: {
          created_at: string
          density: number
          edge_count: number
          edge_state: Json
          id: string
          node_count: number
          node_state: Json
          organization_id: string
          snapshot_hash: string
          snapshot_label: string
          topology_state: Json
        }
        Insert: {
          created_at?: string
          density?: number
          edge_count?: number
          edge_state?: Json
          id?: string
          node_count?: number
          node_state?: Json
          organization_id: string
          snapshot_hash: string
          snapshot_label: string
          topology_state?: Json
        }
        Update: {
          created_at?: string
          density?: number
          edge_count?: number
          edge_state?: Json
          id?: string
          node_count?: number
          node_state?: Json
          organization_id?: string
          snapshot_hash?: string
          snapshot_label?: string
          topology_state?: Json
        }
        Relationships: []
      }
      graph_topology_scores: {
        Row: {
          blast_radius_breakdown: Json
          blast_radius_score: number
          centrality_score: number
          computed_at: string
          conflict_density: number
          cross_source_consistency: number
          decision_dependency_score: number
          escalation_density: number
          evidence_confidence: number
          exposure_score: number
          historical_accuracy: number
          id: string
          node_id: string
          operational_criticality: number
          organization_id: string
          propagation_risk: number
          relationship_stability: number
          scoring_breakdown: Json
          topology_reliability: number
          volatility_score: number
        }
        Insert: {
          blast_radius_breakdown?: Json
          blast_radius_score?: number
          centrality_score?: number
          computed_at?: string
          conflict_density?: number
          cross_source_consistency?: number
          decision_dependency_score?: number
          escalation_density?: number
          evidence_confidence?: number
          exposure_score?: number
          historical_accuracy?: number
          id?: string
          node_id: string
          operational_criticality?: number
          organization_id: string
          propagation_risk?: number
          relationship_stability?: number
          scoring_breakdown?: Json
          topology_reliability?: number
          volatility_score?: number
        }
        Update: {
          blast_radius_breakdown?: Json
          blast_radius_score?: number
          centrality_score?: number
          computed_at?: string
          conflict_density?: number
          cross_source_consistency?: number
          decision_dependency_score?: number
          escalation_density?: number
          evidence_confidence?: number
          exposure_score?: number
          historical_accuracy?: number
          id?: string
          node_id?: string
          operational_criticality?: number
          organization_id?: string
          propagation_risk?: number
          relationship_stability?: number
          scoring_breakdown?: Json
          topology_reliability?: number
          volatility_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "graph_topology_scores_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: true
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_traversal_cache: {
        Row: {
          confidence: number
          confidence_breakdown: Json
          created_at: string
          evidence_refs: Json
          expires_at: string
          id: string
          organization_id: string
          reasoning_chain: Json
          start_node_id: string
          target_node_id: string | null
          traversal_path: Json
          traversal_type: string
        }
        Insert: {
          confidence?: number
          confidence_breakdown?: Json
          created_at?: string
          evidence_refs?: Json
          expires_at?: string
          id?: string
          organization_id: string
          reasoning_chain?: Json
          start_node_id: string
          target_node_id?: string | null
          traversal_path?: Json
          traversal_type: string
        }
        Update: {
          confidence?: number
          confidence_breakdown?: Json
          created_at?: string
          evidence_refs?: Json
          expires_at?: string
          id?: string
          organization_id?: string
          reasoning_chain?: Json
          start_node_id?: string
          target_node_id?: string | null
          traversal_path?: Json
          traversal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_traversal_cache_start_node_id_fkey"
            columns: ["start_node_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_traversal_cache_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_benchmarks: {
        Row: {
          created_at: string
          id: string
          industry: string
          metric_type: string
          p10: number
          p25: number
          p50: number
          p75: number
          p90: number
          region: string | null
          revenue_band: string | null
          sample_size: number
          size_band: string | null
          source: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          industry: string
          metric_type: string
          p10?: number
          p25?: number
          p50?: number
          p75?: number
          p90?: number
          region?: string | null
          revenue_band?: string | null
          sample_size?: number
          size_band?: string | null
          source?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string
          metric_type?: string
          p10?: number
          p25?: number
          p50?: number
          p75?: number
          p90?: number
          region?: string | null
          revenue_band?: string | null
          sample_size?: number
          size_band?: string | null
          source?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          capped_confidence: number | null
          category: string | null
          confidence_cap_reason: string | null
          confidence_score: number | null
          created_at: string
          data_quality_index: number | null
          dataset_id: string | null
          decision_context_id: string | null
          generation_model: string | null
          id: string
          is_read: boolean
          message: string
          organization_id: string
          raw_confidence: number | null
          sample_size: number | null
          severity: string
          source_kpi_id: string | null
          source_metric_ids: Json | null
          variance_score: number | null
        }
        Insert: {
          capped_confidence?: number | null
          category?: string | null
          confidence_cap_reason?: string | null
          confidence_score?: number | null
          created_at?: string
          data_quality_index?: number | null
          dataset_id?: string | null
          decision_context_id?: string | null
          generation_model?: string | null
          id?: string
          is_read?: boolean
          message: string
          organization_id: string
          raw_confidence?: number | null
          sample_size?: number | null
          severity?: string
          source_kpi_id?: string | null
          source_metric_ids?: Json | null
          variance_score?: number | null
        }
        Update: {
          capped_confidence?: number | null
          category?: string | null
          confidence_cap_reason?: string | null
          confidence_score?: number | null
          created_at?: string
          data_quality_index?: number | null
          dataset_id?: string | null
          decision_context_id?: string | null
          generation_model?: string | null
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string
          raw_confidence?: number | null
          sample_size?: number | null
          severity?: string
          source_kpi_id?: string | null
          source_metric_ids?: Json | null
          variance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_decision_context_id_fkey"
            columns: ["decision_context_id"]
            isOneToOne: false
            referencedRelation: "decision_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_advisories: {
        Row: {
          body: string
          brief_id: string | null
          confidence: number
          created_at: string
          id: string
          intelligence_item_id: string | null
          kind: Database["public"]["Enums"]["intelligence_advisory_kind"]
          organization_id: string
          rationale: Json
          title: string
        }
        Insert: {
          body: string
          brief_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          intelligence_item_id?: string | null
          kind: Database["public"]["Enums"]["intelligence_advisory_kind"]
          organization_id: string
          rationale?: Json
          title: string
        }
        Update: {
          body?: string
          brief_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          intelligence_item_id?: string | null
          kind?: Database["public"]["Enums"]["intelligence_advisory_kind"]
          organization_id?: string
          rationale?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_advisories_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "intelligence_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_advisories_intelligence_item_id_fkey"
            columns: ["intelligence_item_id"]
            isOneToOne: false
            referencedRelation: "aicis_intelligence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_audit_trail: {
        Row: {
          confidence_score: number | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          input_data: Json | null
          model_used: string | null
          organization_id: string
          output_data: Json | null
          processing_time_ms: number | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          input_data?: Json | null
          model_used?: string | null
          organization_id: string
          output_data?: Json | null
          processing_time_ms?: number | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          input_data?: Json | null
          model_used?: string | null
          organization_id?: string
          output_data?: Json | null
          processing_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_audit_trail_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_briefs: {
        Row: {
          affected_areas: string[]
          cluster_id: string | null
          confidence: number
          generated_at: string
          id: string
          item_ids: string[]
          organization_id: string
          projected_impact_window: unknown
          recommended_actions: Json
          severity: string
          summary: string
          title: string
          why_it_matters: string | null
        }
        Insert: {
          affected_areas?: string[]
          cluster_id?: string | null
          confidence?: number
          generated_at?: string
          id?: string
          item_ids?: string[]
          organization_id: string
          projected_impact_window?: unknown
          recommended_actions?: Json
          severity?: string
          summary: string
          title: string
          why_it_matters?: string | null
        }
        Update: {
          affected_areas?: string[]
          cluster_id?: string | null
          confidence?: number
          generated_at?: string
          id?: string
          item_ids?: string[]
          organization_id?: string
          projected_impact_window?: unknown
          recommended_actions?: Json
          severity?: string
          summary?: string
          title?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_briefs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "intelligence_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_clusters: {
        Row: {
          canonical_summary: string | null
          cluster_key: string
          escalation_velocity: number
          first_seen_at: string
          id: string
          last_seen_at: string
          organization_id: string
          related_item_ids: string[]
          source_count: number
          trend_strength: number
        }
        Insert: {
          canonical_summary?: string | null
          cluster_key: string
          escalation_velocity?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id: string
          related_item_ids?: string[]
          source_count?: number
          trend_strength?: number
        }
        Update: {
          canonical_summary?: string | null
          cluster_key?: string
          escalation_velocity?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string
          related_item_ids?: string[]
          source_count?: number
          trend_strength?: number
        }
        Relationships: []
      }
      intelligence_feedback: {
        Row: {
          brief_id: string | null
          created_at: string
          feedback: Database["public"]["Enums"]["intelligence_feedback_kind"]
          feedback_reason: string | null
          feedback_weight: number
          id: string
          intelligence_item_id: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          brief_id?: string | null
          created_at?: string
          feedback: Database["public"]["Enums"]["intelligence_feedback_kind"]
          feedback_reason?: string | null
          feedback_weight?: number
          id?: string
          intelligence_item_id?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          brief_id?: string | null
          created_at?: string
          feedback?: Database["public"]["Enums"]["intelligence_feedback_kind"]
          feedback_reason?: string | null
          feedback_weight?: number
          id?: string
          intelligence_item_id?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_feedback_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "intelligence_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_feedback_intelligence_item_id_fkey"
            columns: ["intelligence_item_id"]
            isOneToOne: false
            referencedRelation: "aicis_intelligence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_fusion_clusters: {
        Row: {
          affected_domains: string[]
          affected_entities: string[]
          affected_geographies: string[]
          canonical_summary: string | null
          cluster_signature: string | null
          cluster_type: string
          confidence_breakdown: Json
          confidence_score: number
          escalation_velocity: number
          evidence_hash: string | null
          expires_at: string | null
          first_seen_at: string
          generated_at: string
          id: string
          llm_rendered: boolean
          narrative: string | null
          narrative_class: string | null
          narrative_domain_mix: Json
          narrative_scope: string | null
          narrative_severity: string | null
          narrative_strength: number
          organization_id: string
          pressure_score: number
          stability_score: number
          status: string
          superseded_by: string | null
          supporting_advisory_ids: string[]
          supporting_intervention_ids: string[]
          supporting_item_ids: string[]
          title: string
          trend_direction: string
          updated_at: string
          version: number
          volatility_score: number
        }
        Insert: {
          affected_domains?: string[]
          affected_entities?: string[]
          affected_geographies?: string[]
          canonical_summary?: string | null
          cluster_signature?: string | null
          cluster_type?: string
          confidence_breakdown?: Json
          confidence_score?: number
          escalation_velocity?: number
          evidence_hash?: string | null
          expires_at?: string | null
          first_seen_at?: string
          generated_at?: string
          id?: string
          llm_rendered?: boolean
          narrative?: string | null
          narrative_class?: string | null
          narrative_domain_mix?: Json
          narrative_scope?: string | null
          narrative_severity?: string | null
          narrative_strength?: number
          organization_id: string
          pressure_score?: number
          stability_score?: number
          status?: string
          superseded_by?: string | null
          supporting_advisory_ids?: string[]
          supporting_intervention_ids?: string[]
          supporting_item_ids?: string[]
          title: string
          trend_direction?: string
          updated_at?: string
          version?: number
          volatility_score?: number
        }
        Update: {
          affected_domains?: string[]
          affected_entities?: string[]
          affected_geographies?: string[]
          canonical_summary?: string | null
          cluster_signature?: string | null
          cluster_type?: string
          confidence_breakdown?: Json
          confidence_score?: number
          escalation_velocity?: number
          evidence_hash?: string | null
          expires_at?: string | null
          first_seen_at?: string
          generated_at?: string
          id?: string
          llm_rendered?: boolean
          narrative?: string | null
          narrative_class?: string | null
          narrative_domain_mix?: Json
          narrative_scope?: string | null
          narrative_severity?: string | null
          narrative_strength?: number
          organization_id?: string
          pressure_score?: number
          stability_score?: number
          status?: string
          superseded_by?: string | null
          supporting_advisory_ids?: string[]
          supporting_intervention_ids?: string[]
          supporting_item_ids?: string[]
          title?: string
          trend_direction?: string
          updated_at?: string
          version?: number
          volatility_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_fusion_clusters_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "intelligence_fusion_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_memory: {
        Row: {
          attribution_notes: string | null
          effectiveness_rating: number | null
          id: string
          intelligence_item_id: string | null
          observed_outcome: string | null
          organization_id: string
          recorded_at: string
          recorded_by: string | null
          route_id: string | null
        }
        Insert: {
          attribution_notes?: string | null
          effectiveness_rating?: number | null
          id?: string
          intelligence_item_id?: string | null
          observed_outcome?: string | null
          organization_id: string
          recorded_at?: string
          recorded_by?: string | null
          route_id?: string | null
        }
        Update: {
          attribution_notes?: string | null
          effectiveness_rating?: number | null
          id?: string
          intelligence_item_id?: string | null
          observed_outcome?: string | null
          organization_id?: string
          recorded_at?: string
          recorded_by?: string | null
          route_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_memory_intelligence_item_id_fkey"
            columns: ["intelligence_item_id"]
            isOneToOne: false
            referencedRelation: "aicis_intelligence_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_memory_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "intelligence_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_observability: {
        Row: {
          avg_processing_ms: number
          conversion_rate: number
          day: string
          duplicates_suppressed: number
          id: string
          imports_failed: number
          imports_total: number
          items_to_decisions: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          avg_processing_ms?: number
          conversion_rate?: number
          day?: string
          duplicates_suppressed?: number
          id?: string
          imports_failed?: number
          imports_total?: number
          items_to_decisions?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          avg_processing_ms?: number
          conversion_rate?: number
          day?: string
          duplicates_suppressed?: number
          id?: string
          imports_failed?: number
          imports_total?: number
          items_to_decisions?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_product_verifications: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          inputs_hash: string | null
          is_reproducible: boolean
          organization_id: string
          output_summary: string | null
          sources: Json
          transformations: Json
          verification_hash: string
          verified_at: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          inputs_hash?: string | null
          is_reproducible?: boolean
          organization_id: string
          output_summary?: string | null
          sources?: Json
          transformations?: Json
          verification_hash: string
          verified_at?: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          inputs_hash?: string | null
          is_reproducible?: boolean
          organization_id?: string
          output_summary?: string | null
          sources?: Json
          transformations?: Json
          verification_hash?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_product_verifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_relevance_scores: {
        Row: {
          business_impact_score: number
          computed_at: string
          decision_pressure_score: number
          factors: Json
          id: string
          intelligence_item_id: string
          operational_urgency_score: number
          organization_id: string
          organization_relevance_score: number
        }
        Insert: {
          business_impact_score: number
          computed_at?: string
          decision_pressure_score?: number
          factors?: Json
          id?: string
          intelligence_item_id: string
          operational_urgency_score: number
          organization_id: string
          organization_relevance_score: number
        }
        Update: {
          business_impact_score?: number
          computed_at?: string
          decision_pressure_score?: number
          factors?: Json
          id?: string
          intelligence_item_id?: string
          operational_urgency_score?: number
          organization_id?: string
          organization_relevance_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_relevance_scores_intelligence_item_id_fkey"
            columns: ["intelligence_item_id"]
            isOneToOne: true
            referencedRelation: "aicis_intelligence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_routes: {
        Row: {
          brief_id: string | null
          created_at: string
          id: string
          intelligence_item_id: string | null
          organization_id: string
          owner_user_id: string | null
          reason: string | null
          route_type: string
          routed_by: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          brief_id?: string | null
          created_at?: string
          id?: string
          intelligence_item_id?: string | null
          organization_id: string
          owner_user_id?: string | null
          reason?: string | null
          route_type: string
          routed_by: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          brief_id?: string | null
          created_at?: string
          id?: string
          intelligence_item_id?: string | null
          organization_id?: string
          owner_user_id?: string | null
          reason?: string | null
          route_type?: string
          routed_by?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_routes_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "intelligence_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_routes_intelligence_item_id_fkey"
            columns: ["intelligence_item_id"]
            isOneToOne: false
            referencedRelation: "aicis_intelligence_items"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_reference_data: {
        Row: {
          category: string
          confidence_grade: string | null
          created_at: string
          id: string
          industry: string | null
          metadata: Json | null
          metric_name: string
          organization_id: string | null
          period_end: string | null
          period_start: string | null
          region: string | null
          source: string
          source_url: string | null
          unit: string | null
          updated_at: string
          value: number
        }
        Insert: {
          category: string
          confidence_grade?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          metadata?: Json | null
          metric_name: string
          organization_id?: string | null
          period_end?: string | null
          period_start?: string | null
          region?: string | null
          source: string
          source_url?: string | null
          unit?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          category?: string
          confidence_grade?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          metadata?: Json | null
          metric_name?: string
          organization_id?: string | null
          period_end?: string | null
          period_start?: string | null
          region?: string | null
          source?: string
          source_url?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "internal_reference_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_escalations: {
        Row: {
          actor_id: string | null
          created_at: string
          escalation_level: number
          escalation_reason: string
          escalation_summary: string | null
          escalation_targets: Json
          id: string
          intervention_id: string
          metadata: Json
          organization_id: string
          resolved: boolean
          resolved_at: string | null
          triggered_by: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          escalation_level?: number
          escalation_reason: string
          escalation_summary?: string | null
          escalation_targets?: Json
          id?: string
          intervention_id: string
          metadata?: Json
          organization_id: string
          resolved?: boolean
          resolved_at?: string | null
          triggered_by?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          escalation_level?: number
          escalation_reason?: string
          escalation_summary?: string | null
          escalation_targets?: Json
          id?: string
          intervention_id?: string
          metadata?: Json
          organization_id?: string
          resolved?: boolean
          resolved_at?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "intervention_escalations_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: false
            referencedRelation: "executive_interventions"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_fatigue: {
        Row: {
          computed_at: string
          escalation_density: number
          fatigue_score: number
          id: string
          ignored_count: number
          organization_id: string
          overload_risk: string
          repeat_advisories: number
          scope_id: string
          scope_type: string
          suppression_recommendations: Json
          total_interventions: number
          unresolved_count: number
          window_end: string
          window_start: string
        }
        Insert: {
          computed_at?: string
          escalation_density?: number
          fatigue_score?: number
          id?: string
          ignored_count?: number
          organization_id: string
          overload_risk?: string
          repeat_advisories?: number
          scope_id: string
          scope_type: string
          suppression_recommendations?: Json
          total_interventions?: number
          unresolved_count?: number
          window_end: string
          window_start: string
        }
        Update: {
          computed_at?: string
          escalation_density?: number
          fatigue_score?: number
          id?: string
          ignored_count?: number
          organization_id?: string
          overload_risk?: string
          repeat_advisories?: number
          scope_id?: string
          scope_type?: string
          suppression_recommendations?: Json
          total_interventions?: number
          unresolved_count?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      intervention_learning: {
        Row: {
          effectiveness_score: number | null
          escalation_accuracy: number | null
          false_positive: boolean
          id: string
          intervention_id: string
          notes: string | null
          operational_impact_reduction: number | null
          organization_id: string
          outcome: string | null
          recommendation_confidence_adjustment: number
          recorded_at: string
          recurrence_count: number
          time_to_resolution_hours: number | null
        }
        Insert: {
          effectiveness_score?: number | null
          escalation_accuracy?: number | null
          false_positive?: boolean
          id?: string
          intervention_id: string
          notes?: string | null
          operational_impact_reduction?: number | null
          organization_id: string
          outcome?: string | null
          recommendation_confidence_adjustment?: number
          recorded_at?: string
          recurrence_count?: number
          time_to_resolution_hours?: number | null
        }
        Update: {
          effectiveness_score?: number | null
          escalation_accuracy?: number | null
          false_positive?: boolean
          id?: string
          intervention_id?: string
          notes?: string | null
          operational_impact_reduction?: number | null
          organization_id?: string
          outcome?: string | null
          recommendation_confidence_adjustment?: number
          recorded_at?: string
          recurrence_count?: number
          time_to_resolution_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intervention_learning_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: true
            referencedRelation: "executive_interventions"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_observability: {
        Row: {
          avg_resolution_hours: number | null
          avg_response_latency_minutes: number | null
          computed_at: string
          conversion_to_decision_rate: number
          creation_count: number
          day: string
          effectiveness_avg: number | null
          escalation_count: number
          false_positive_count: number
          fatigue_score: number
          id: string
          organization_id: string
          resolution_count: number
        }
        Insert: {
          avg_resolution_hours?: number | null
          avg_response_latency_minutes?: number | null
          computed_at?: string
          conversion_to_decision_rate?: number
          creation_count?: number
          day: string
          effectiveness_avg?: number | null
          escalation_count?: number
          false_positive_count?: number
          fatigue_score?: number
          id?: string
          organization_id: string
          resolution_count?: number
        }
        Update: {
          avg_resolution_hours?: number | null
          avg_response_latency_minutes?: number | null
          computed_at?: string
          conversion_to_decision_rate?: number
          creation_count?: number
          day?: string
          effectiveness_avg?: number | null
          escalation_count?: number
          false_positive_count?: number
          fatigue_score?: number
          id?: string
          organization_id?: string
          resolution_count?: number
        }
        Relationships: []
      }
      iq_dimension_scores: {
        Row: {
          computed_at: string
          dataset_id: string | null
          details: Json
          dimension: string
          id: string
          organization_id: string
          sample_size: number
          score: number
        }
        Insert: {
          computed_at?: string
          dataset_id?: string | null
          details?: Json
          dimension: string
          id?: string
          organization_id: string
          sample_size?: number
          score: number
        }
        Update: {
          computed_at?: string
          dataset_id?: string | null
          details?: Json
          dimension?: string
          id?: string
          organization_id?: string
          sample_size?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "iq_dimension_scores_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iq_dimension_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          created_at: string
          current_value: number
          id: string
          kpi_id: string | null
          metric_type: string | null
          objective_id: string
          organization_id: string
          status: string
          target_value: number
          title: string
          unit: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          kpi_id?: string | null
          metric_type?: string | null
          objective_id: string
          organization_id: string
          status?: string
          target_value?: number
          title: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          kpi_id?: string | null
          metric_type?: string | null
          objective_id?: string
          organization_id?: string
          status?: string
          target_value?: number
          title?: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "key_results_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_targets: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kpi_id: string
          organization_id: string
          target_date: string
          target_value: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kpi_id: string
          organization_id: string
          target_date: string
          target_value: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kpi_id?: string
          organization_id?: string
          target_date?: string
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_targets_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry: string
          kpis: Json
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry: string
          kpis?: Json
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string
          kpis?: Json
          name?: string
        }
        Relationships: []
      }
      kpi_values: {
        Row: {
          computation_version: number | null
          computed_at: string
          date: string
          formula_snapshot: string | null
          id: string
          input_metric_ids: Json | null
          kpi_id: string
          organization_id: string
          value: number
        }
        Insert: {
          computation_version?: number | null
          computed_at?: string
          date: string
          formula_snapshot?: string | null
          id?: string
          input_metric_ids?: Json | null
          kpi_id: string
          organization_id: string
          value: number
        }
        Update: {
          computation_version?: number | null
          computed_at?: string
          date?: string
          formula_snapshot?: string | null
          id?: string
          input_metric_ids?: Json | null
          kpi_id?: string
          organization_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_values_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          aggregation_type: string
          created_at: string
          created_by: string
          dataset_id: string | null
          description: string | null
          formula: string
          id: string
          metric_dependencies: Json
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          aggregation_type?: string
          created_at?: string
          created_by: string
          dataset_id?: string | null
          description?: string | null
          formula: string
          id?: string
          metric_dependencies?: Json
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          aggregation_type?: string
          created_at?: string
          created_by?: string
          dataset_id?: string | null
          description?: string | null
          formula?: string
          id?: string
          metric_dependencies?: Json
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpis_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maturity_assessments: {
        Row: {
          assessed_by: string | null
          created_at: string
          dimensions: Json
          id: string
          next_actions: Json
          organization_id: string
          overall_level: number
          overall_score: number
          readiness_grade: string
          scaling_readiness: number
        }
        Insert: {
          assessed_by?: string | null
          created_at?: string
          dimensions?: Json
          id?: string
          next_actions?: Json
          organization_id: string
          overall_level?: number
          overall_score?: number
          readiness_grade?: string
          scaling_readiness?: number
        }
        Update: {
          assessed_by?: string | null
          created_at?: string
          dimensions?: Json
          id?: string
          next_actions?: Json
          organization_id?: string
          overall_level?: number
          overall_score?: number
          readiness_grade?: string
          scaling_readiness?: number
        }
        Relationships: [
          {
            foreignKeyName: "maturity_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_aggregates: {
        Row: {
          agg_avg: number | null
          agg_count: number
          agg_max: number | null
          agg_min: number | null
          agg_sum: number
          computed_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string | null
          id: string
          metric_type: string
          organization_id: string
          period_start: string
          period_type: string
          region: string
          segment: string
          source_name: string
          trust_level: number
          visibility_scope: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id: string | null
        }
        Insert: {
          agg_avg?: number | null
          agg_count?: number
          agg_max?: number | null
          agg_min?: number | null
          agg_sum?: number
          computed_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string | null
          id?: string
          metric_type: string
          organization_id: string
          period_start: string
          period_type?: string
          region?: string
          segment?: string
          source_name?: string
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Update: {
          agg_avg?: number | null
          agg_count?: number
          agg_max?: number | null
          agg_min?: number | null
          agg_sum?: number
          computed_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string | null
          id?: string
          metric_type?: string
          organization_id?: string
          period_start?: string
          period_type?: string
          region?: string
          segment?: string
          source_name?: string
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_aggregates_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_aggregates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_aggregates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_latest: {
        Row: {
          computed_at: string
          dataset_id: string
          latest_date: string
          latest_value: number
          max_value: number | null
          mean_value: number | null
          metric_type: string
          min_value: number | null
          organization_id: string
          stddev_value: number | null
          total_count: number
          total_sum: number
          trend_slope: number | null
        }
        Insert: {
          computed_at?: string
          dataset_id: string
          latest_date: string
          latest_value: number
          max_value?: number | null
          mean_value?: number | null
          metric_type: string
          min_value?: number | null
          organization_id: string
          stddev_value?: number | null
          total_count?: number
          total_sum?: number
          trend_slope?: number | null
        }
        Update: {
          computed_at?: string
          dataset_id?: string
          latest_date?: string
          latest_value?: number
          max_value?: number | null
          mean_value?: number | null
          metric_type?: string
          min_value?: number | null
          organization_id?: string
          stddev_value?: number | null
          total_count?: number
          total_sum?: number
          trend_slope?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_latest_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_latest_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_mappings: {
        Row: {
          aggregation: string | null
          created_at: string
          data_source_id: string
          date_column: string | null
          id: string
          is_active: boolean | null
          metric_type: string
          organization_id: string
          region_column: string | null
          segment_column: string | null
          source_column: string
          source_table: string
          transform_expression: string | null
          updated_at: string
        }
        Insert: {
          aggregation?: string | null
          created_at?: string
          data_source_id: string
          date_column?: string | null
          id?: string
          is_active?: boolean | null
          metric_type: string
          organization_id: string
          region_column?: string | null
          segment_column?: string | null
          source_column: string
          source_table: string
          transform_expression?: string | null
          updated_at?: string
        }
        Update: {
          aggregation?: string | null
          created_at?: string
          data_source_id?: string
          date_column?: string | null
          id?: string
          is_active?: boolean | null
          metric_type?: string
          organization_id?: string
          region_column?: string | null
          segment_column?: string | null
          source_column?: string
          source_table?: string
          transform_expression?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_mappings_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_rollups: {
        Row: {
          computed_at: string
          dataset_id: string
          id: string
          metric_type: string
          organization_id: string
          period_start: string
          period_type: string
          region: string | null
          segment: string | null
          val_avg: number | null
          val_count: number
          val_max: number | null
          val_min: number | null
          val_p50: number | null
          val_stddev: number | null
          val_sum: number
        }
        Insert: {
          computed_at?: string
          dataset_id: string
          id?: string
          metric_type: string
          organization_id: string
          period_start: string
          period_type: string
          region?: string | null
          segment?: string | null
          val_avg?: number | null
          val_count?: number
          val_max?: number | null
          val_min?: number | null
          val_p50?: number | null
          val_stddev?: number | null
          val_sum?: number
        }
        Update: {
          computed_at?: string
          dataset_id?: string
          id?: string
          metric_type?: string
          organization_id?: string
          period_start?: string
          period_type?: string
          region?: string | null
          segment?: string | null
          val_avg?: number | null
          val_count?: number
          val_max?: number | null
          val_min?: number | null
          val_p50?: number | null
          val_stddev?: number | null
          val_sum?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_rollups_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_rollups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_summaries: {
        Row: {
          computed_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string
          id: string
          latest_date: string | null
          latest_value: number
          metric_type: string
          organization_id: string
          previous_half_total: number | null
          row_count: number
          source_name: string
          total: number
          trend: string
          trust_level: number
          visibility_scope: Database["public"]["Enums"]["visibility_scope_type"]
        }
        Insert: {
          computed_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string
          id?: string
          latest_date?: string | null
          latest_value?: number
          metric_type: string
          organization_id: string
          previous_half_total?: number | null
          row_count?: number
          source_name?: string
          total?: number
          trend?: string
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
        }
        Update: {
          computed_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string
          id?: string
          latest_date?: string | null
          latest_value?: number
          metric_type?: string
          organization_id?: string
          previous_half_total?: number | null
          row_count?: number
          source_name?: string
          total?: number
          trend?: string
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
        }
        Relationships: [
          {
            foreignKeyName: "metric_summaries_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          created_at: string
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string | null
          date: string
          id: string
          ingested_at: string
          metric_type: string
          organization_id: string
          quality_score: number | null
          region: string
          segment: string
          source_id: string
          source_name: string
          source_type: string
          trust_level: number
          value: number
          visibility_scope: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string | null
          date: string
          id?: string
          ingested_at?: string
          metric_type: string
          organization_id: string
          quality_score?: number | null
          region?: string
          segment?: string
          source_id?: string
          source_name?: string
          source_type?: string
          trust_level?: number
          value: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string | null
          date?: string
          id?: string
          ingested_at?: string
          metric_type?: string
          organization_id?: string
          quality_score?: number | null
          region?: string
          segment?: string
          source_id?: string
          source_name?: string
          source_type?: string
          trust_level?: number
          value?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      model_drift_snapshots: {
        Row: {
          baseline_snapshot_id: string | null
          created_at: string
          drift_detected: boolean | null
          drift_score: number | null
          feature_importance: Json | null
          id: string
          model_name: string
          organization_id: string
          prediction_distribution: Json | null
          snapshot_date: string
        }
        Insert: {
          baseline_snapshot_id?: string | null
          created_at?: string
          drift_detected?: boolean | null
          drift_score?: number | null
          feature_importance?: Json | null
          id?: string
          model_name: string
          organization_id: string
          prediction_distribution?: Json | null
          snapshot_date?: string
        }
        Update: {
          baseline_snapshot_id?: string | null
          created_at?: string
          drift_detected?: boolean | null
          drift_score?: number | null
          feature_importance?: Json | null
          id?: string
          model_name?: string
          organization_id?: string
          prediction_distribution?: Json | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_drift_snapshots_baseline_snapshot_id_fkey"
            columns: ["baseline_snapshot_id"]
            isOneToOne: false
            referencedRelation: "model_drift_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_drift_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_audit_log: {
        Row: {
          actor: string
          actor_user_id: string | null
          cluster_id: string | null
          cluster_signature: string | null
          created_at: string
          event_type: string
          id: string
          new_state: Json
          organization_id: string
          prior_state: Json
          reason: string | null
        }
        Insert: {
          actor?: string
          actor_user_id?: string | null
          cluster_id?: string | null
          cluster_signature?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_state?: Json
          organization_id: string
          prior_state?: Json
          reason?: string | null
        }
        Update: {
          actor?: string
          actor_user_id?: string | null
          cluster_id?: string | null
          cluster_signature?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_state?: Json
          organization_id?: string
          prior_state?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "narrative_audit_log_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "intelligence_fusion_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_conflicts: {
        Row: {
          affected_dimensions: string[]
          conflict_type: string
          detected_at: string
          evidence_disagreement: Json
          id: string
          narrative_a_id: string
          narrative_b_id: string
          organization_id: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: string
        }
        Insert: {
          affected_dimensions?: string[]
          conflict_type: string
          detected_at?: string
          evidence_disagreement?: Json
          id?: string
          narrative_a_id: string
          narrative_b_id: string
          organization_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Update: {
          affected_dimensions?: string[]
          conflict_type?: string
          detected_at?: string
          evidence_disagreement?: Json
          id?: string
          narrative_a_id?: string
          narrative_b_id?: string
          organization_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_conflicts_narrative_a_id_fkey"
            columns: ["narrative_a_id"]
            isOneToOne: false
            referencedRelation: "intelligence_fusion_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_conflicts_narrative_b_id_fkey"
            columns: ["narrative_b_id"]
            isOneToOne: false
            referencedRelation: "intelligence_fusion_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_memory: {
        Row: {
          cluster_id: string | null
          cluster_signature: string | null
          created_at: string
          decision_ids: string[]
          false_positive: boolean
          id: string
          ignored: boolean
          led_to_decision: boolean
          narrative_effectiveness_score: number
          narrative_resolution_rate: number
          narrative_trust_score: number
          notes: string | null
          organization_id: string
          outcome_effective: boolean | null
          outcome_observed: boolean
          resolution_time_hours: number | null
          updated_at: string
        }
        Insert: {
          cluster_id?: string | null
          cluster_signature?: string | null
          created_at?: string
          decision_ids?: string[]
          false_positive?: boolean
          id?: string
          ignored?: boolean
          led_to_decision?: boolean
          narrative_effectiveness_score?: number
          narrative_resolution_rate?: number
          narrative_trust_score?: number
          notes?: string | null
          organization_id: string
          outcome_effective?: boolean | null
          outcome_observed?: boolean
          resolution_time_hours?: number | null
          updated_at?: string
        }
        Update: {
          cluster_id?: string | null
          cluster_signature?: string | null
          created_at?: string
          decision_ids?: string[]
          false_positive?: boolean
          id?: string
          ignored?: boolean
          led_to_decision?: boolean
          narrative_effectiveness_score?: number
          narrative_resolution_rate?: number
          narrative_trust_score?: number
          notes?: string | null
          organization_id?: string
          outcome_effective?: boolean | null
          outcome_observed?: boolean
          resolution_time_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_memory_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "intelligence_fusion_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_suppression_log: {
        Row: {
          candidate_snapshot: Json
          cluster_signature: string | null
          id: string
          organization_id: string
          suppressed_at: string
          suppression_details: Json
          suppression_reason: string
        }
        Insert: {
          candidate_snapshot?: Json
          cluster_signature?: string | null
          id?: string
          organization_id: string
          suppressed_at?: string
          suppression_details?: Json
          suppression_reason: string
        }
        Update: {
          candidate_snapshot?: Json
          cluster_signature?: string | null
          id?: string
          organization_id?: string
          suppressed_at?: string
          suppression_details?: Json
          suppression_reason?: string
        }
        Relationships: []
      }
      nlq_queries: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          interpreted_intent: Json | null
          organization_id: string
          query_text: string
          results: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          interpreted_intent?: Json | null
          organization_id: string
          query_text: string
          results?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          interpreted_intent?: Json | null
          organization_id?: string
          query_text?: string
          results?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nlq_queries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          organization_id: string
          recipients: string[]
          role_type: string
          status: string
          subject: string
          week_start: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          recipients?: string[]
          role_type: string
          status?: string
          subject: string
          week_start?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          recipients?: string[]
          role_type?: string
          status?: string
          subject?: string
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          alert_threshold: number
          created_at: string
          email_enabled: boolean
          email_recipients: string[]
          escalation_threshold: number
          id: string
          organization_id: string
          role_type: string
          slack_enabled: boolean
          slack_webhook_url: string | null
          updated_at: string
          weekly_brief_enabled: boolean
        }
        Insert: {
          alert_threshold?: number
          created_at?: string
          email_enabled?: boolean
          email_recipients?: string[]
          escalation_threshold?: number
          id?: string
          organization_id: string
          role_type: string
          slack_enabled?: boolean
          slack_webhook_url?: string | null
          updated_at?: string
          weekly_brief_enabled?: boolean
        }
        Update: {
          alert_threshold?: number
          created_at?: string
          email_enabled?: boolean
          email_recipients?: string[]
          escalation_threshold?: number
          id?: string
          organization_id?: string
          role_type?: string
          slack_enabled?: boolean
          slack_webhook_url?: string | null
          updated_at?: string
          weekly_brief_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          created_at: string
          description: string | null
          id: string
          organization_id: string
          owner_id: string
          parent_id: string | null
          progress: number
          status: string
          time_period: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          owner_id: string
          parent_id?: string | null
          progress?: number
          status?: string
          time_period?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          owner_id?: string
          parent_id?: string | null
          progress?: number
          status?: string
          time_period?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_graph_edges: {
        Row: {
          confidence: number
          created_at: string
          directionality: string
          edge_staleness_state: string
          edge_type: string
          evidence_refs: Json
          id: string
          last_validated_at: string
          max_propagation_influence: number
          organization_id: string
          propagation_saturation_score: number
          propagation_weight: number
          provenance: Json
          relationship_semantics: string
          source_node_id: string
          strength: number
          target_node_id: string
          updated_at: string
          validity_decay_score: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          directionality?: string
          edge_staleness_state?: string
          edge_type: string
          evidence_refs?: Json
          id?: string
          last_validated_at?: string
          max_propagation_influence?: number
          organization_id: string
          propagation_saturation_score?: number
          propagation_weight?: number
          provenance?: Json
          relationship_semantics?: string
          source_node_id: string
          strength?: number
          target_node_id: string
          updated_at?: string
          validity_decay_score?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          directionality?: string
          edge_staleness_state?: string
          edge_type?: string
          evidence_refs?: Json
          id?: string
          last_validated_at?: string
          max_propagation_influence?: number
          organization_id?: string
          propagation_saturation_score?: number
          propagation_weight?: number
          provenance?: Json
          relationship_semantics?: string
          source_node_id?: string
          strength?: number
          target_node_id?: string
          updated_at?: string
          validity_decay_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "operational_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_graph_nodes: {
        Row: {
          canonical_key: string
          created_at: string
          exposure_score: number
          id: string
          metadata: Json
          node_ref_id: string | null
          node_type: string
          operational_criticality: number
          operational_state: string | null
          organization_id: string
          status: string
          summary: string | null
          title: string
          updated_at: string
          volatility_score: number
        }
        Insert: {
          canonical_key: string
          created_at?: string
          exposure_score?: number
          id?: string
          metadata?: Json
          node_ref_id?: string | null
          node_type: string
          operational_criticality?: number
          operational_state?: string | null
          organization_id: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          volatility_score?: number
        }
        Update: {
          canonical_key?: string
          created_at?: string
          exposure_score?: number
          id?: string
          metadata?: Json
          node_ref_id?: string | null
          node_type?: string
          operational_criticality?: number
          operational_state?: string | null
          organization_id?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          volatility_score?: number
        }
        Relationships: []
      }
      orchestration_runs: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          organization_id: string
          started_at: string
          status: string
          steps_completed: Json | null
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          organization_id: string
          started_at?: string
          status?: string
          steps_completed?: Json | null
          trigger_type?: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          organization_id?: string
          started_at?: string
          status?: string
          steps_completed?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding: {
        Row: {
          accent_color: string | null
          company_name: string | null
          created_at: string | null
          custom_domain: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          organization_id: string
          primary_color: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          company_name?: string | null
          created_at?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id: string
          primary_color?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          company_name?: string | null
          created_at?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id?: string
          primary_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_context_packs: {
        Row: {
          config_overrides: Json
          derived_from_pack: string | null
          enabled_at: string
          enabled_by: string | null
          is_locked: boolean
          organization_id: string
          pack_key: string
        }
        Insert: {
          config_overrides?: Json
          derived_from_pack?: string | null
          enabled_at?: string
          enabled_by?: string | null
          is_locked?: boolean
          organization_id: string
          pack_key: string
        }
        Update: {
          config_overrides?: Json
          derived_from_pack?: string | null
          enabled_at?: string
          enabled_by?: string | null
          is_locked?: boolean
          organization_id?: string
          pack_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_context_packs_pack_key_fkey"
            columns: ["pack_key"]
            isOneToOne: false
            referencedRelation: "context_packs"
            referencedColumns: ["pack_key"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizational_identity: {
        Row: {
          competitive_position: string | null
          core_values: Json | null
          created_at: string
          decision_principles: Json | null
          decision_speed_preference: string | null
          ethical_boundaries: Json | null
          governance_model: string | null
          governance_model_config: Json
          id: string
          industry_context: string | null
          innovation_posture: string | null
          key_stakeholders: Json | null
          market_stage: string | null
          mission_statement: string | null
          organization_id: string
          regulatory_environment: string | null
          risk_appetite: string | null
          stakeholder_orientation: string | null
          strategic_priorities: Json | null
          updated_at: string
          updated_by: string | null
          vision_statement: string | null
        }
        Insert: {
          competitive_position?: string | null
          core_values?: Json | null
          created_at?: string
          decision_principles?: Json | null
          decision_speed_preference?: string | null
          ethical_boundaries?: Json | null
          governance_model?: string | null
          governance_model_config?: Json
          id?: string
          industry_context?: string | null
          innovation_posture?: string | null
          key_stakeholders?: Json | null
          market_stage?: string | null
          mission_statement?: string | null
          organization_id: string
          regulatory_environment?: string | null
          risk_appetite?: string | null
          stakeholder_orientation?: string | null
          strategic_priorities?: Json | null
          updated_at?: string
          updated_by?: string | null
          vision_statement?: string | null
        }
        Update: {
          competitive_position?: string | null
          core_values?: Json | null
          created_at?: string
          decision_principles?: Json | null
          decision_speed_preference?: string | null
          ethical_boundaries?: Json | null
          governance_model?: string | null
          governance_model_config?: Json
          id?: string
          industry_context?: string | null
          innovation_posture?: string | null
          key_stakeholders?: Json | null
          market_stage?: string | null
          mission_statement?: string | null
          organization_id?: string
          regulatory_environment?: string | null
          risk_appetite?: string | null
          stakeholder_orientation?: string | null
          strategic_priorities?: Json | null
          updated_at?: string
          updated_by?: string | null
          vision_statement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizational_identity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizational_pressure_models: {
        Row: {
          breakdown: Json
          contributing_cluster_ids: string[]
          cyber_pressure: number
          execution_pressure: number
          geopolitical_pressure: number
          id: string
          operational_pressure: number
          organization_id: string
          pressure_acceleration: number
          pressure_score: number
          pressure_velocity: number
          regulatory_pressure: number
          snapshot_at: string
          stabilization_indicator: number
          strategic_pressure: number
          supply_chain_pressure: number
        }
        Insert: {
          breakdown?: Json
          contributing_cluster_ids?: string[]
          cyber_pressure?: number
          execution_pressure?: number
          geopolitical_pressure?: number
          id?: string
          operational_pressure?: number
          organization_id: string
          pressure_acceleration?: number
          pressure_score?: number
          pressure_velocity?: number
          regulatory_pressure?: number
          snapshot_at?: string
          stabilization_indicator?: number
          strategic_pressure?: number
          supply_chain_pressure?: number
        }
        Update: {
          breakdown?: Json
          contributing_cluster_ids?: string[]
          cyber_pressure?: number
          execution_pressure?: number
          geopolitical_pressure?: number
          id?: string
          operational_pressure?: number
          organization_id?: string
          pressure_acceleration?: number
          pressure_score?: number
          pressure_velocity?: number
          regulatory_pressure?: number
          snapshot_at?: string
          stabilization_indicator?: number
          strategic_pressure?: number
          supply_chain_pressure?: number
        }
        Relationships: []
      }
      organizations: {
        Row: {
          ai_raw_text_enabled: boolean
          created_at: string
          created_by: string | null
          data_retention_days: number
          id: string
          industry: string | null
          ip_allowlist: string[]
          min_password_length: number
          name: string
          onboarding_completed: boolean
          require_mfa: boolean
          revenue_band: string | null
          session_timeout_minutes: number
          size_band: string | null
          sso_enforced: boolean
        }
        Insert: {
          ai_raw_text_enabled?: boolean
          created_at?: string
          created_by?: string | null
          data_retention_days?: number
          id?: string
          industry?: string | null
          ip_allowlist?: string[]
          min_password_length?: number
          name: string
          onboarding_completed?: boolean
          require_mfa?: boolean
          revenue_band?: string | null
          session_timeout_minutes?: number
          size_band?: string | null
          sso_enforced?: boolean
        }
        Update: {
          ai_raw_text_enabled?: boolean
          created_at?: string
          created_by?: string | null
          data_retention_days?: number
          id?: string
          industry?: string | null
          ip_allowlist?: string[]
          min_password_length?: number
          name?: string
          onboarding_completed?: boolean
          require_mfa?: boolean
          revenue_band?: string | null
          session_timeout_minutes?: number
          size_band?: string | null
          sso_enforced?: boolean
        }
        Relationships: []
      }
      outcome_predictions: {
        Row: {
          confidence_factors: Json | null
          created_at: string
          decision_id: string
          id: string
          model_version: number
          organization_id: string
          predicted_success_probability: number
          similar_decisions_avg_outcome: number | null
          similar_decisions_count: number
          similar_decisions_success_rate: number | null
        }
        Insert: {
          confidence_factors?: Json | null
          created_at?: string
          decision_id: string
          id?: string
          model_version?: number
          organization_id: string
          predicted_success_probability: number
          similar_decisions_avg_outcome?: number | null
          similar_decisions_count?: number
          similar_decisions_success_rate?: number | null
        }
        Update: {
          confidence_factors?: Json | null
          created_at?: string
          decision_id?: string
          id?: string
          model_version?: number
          organization_id?: string
          predicted_success_probability?: number
          similar_decisions_avg_outcome?: number | null
          similar_decisions_count?: number
          similar_decisions_success_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_predictions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          aggregated_count: number | null
          completed_at: string | null
          dataset_id: string
          duration_ms: number | null
          error_count: number | null
          error_message: string | null
          id: string
          metadata: Json | null
          organization_id: string
          raw_count: number | null
          run_type: string
          stage: string
          started_at: string
          status: string
          transformed_count: number | null
          workspace_id: string | null
        }
        Insert: {
          aggregated_count?: number | null
          completed_at?: string | null
          dataset_id: string
          duration_ms?: number | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          raw_count?: number | null
          run_type?: string
          stage?: string
          started_at?: string
          status?: string
          transformed_count?: number | null
          workspace_id?: string | null
        }
        Update: {
          aggregated_count?: number | null
          completed_at?: string | null
          dataset_id?: string
          duration_ms?: number | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          raw_count?: number | null
          run_type?: string
          stage?: string
          started_at?: string
          status?: string
          transformed_count?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_executions: {
        Row: {
          completed_at: string | null
          execution_log: Json
          id: string
          organization_id: string
          playbook_id: string
          started_at: string
          status: string
          steps_completed: number
          total_steps: number
          trigger_value: number | null
        }
        Insert: {
          completed_at?: string | null
          execution_log?: Json
          id?: string
          organization_id: string
          playbook_id: string
          started_at?: string
          status?: string
          steps_completed?: number
          total_steps?: number
          trigger_value?: number | null
        }
        Update: {
          completed_at?: string | null
          execution_log?: Json
          id?: string
          organization_id?: string
          playbook_id?: string
          started_at?: string
          status?: string
          steps_completed?: number
          total_steps?: number
          trigger_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "alert_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_companies: {
        Row: {
          cash_runway_months: number | null
          created_at: string
          current_valuation: number | null
          dataset_id: string | null
          ebitda_ltm: number | null
          ebitda_margin_pct: number | null
          fund_name: string | null
          headcount: number | null
          health_status: string | null
          id: string
          investment_amount: number | null
          investment_date: string | null
          last_board_date: string | null
          name: string
          next_board_date: string | null
          notes: string | null
          organization_id: string
          ownership_pct: number | null
          revenue_growth_pct: number | null
          revenue_ltm: number | null
          risk_score: number | null
          risk_trend: string | null
          sector: string
          updated_at: string
        }
        Insert: {
          cash_runway_months?: number | null
          created_at?: string
          current_valuation?: number | null
          dataset_id?: string | null
          ebitda_ltm?: number | null
          ebitda_margin_pct?: number | null
          fund_name?: string | null
          headcount?: number | null
          health_status?: string | null
          id?: string
          investment_amount?: number | null
          investment_date?: string | null
          last_board_date?: string | null
          name: string
          next_board_date?: string | null
          notes?: string | null
          organization_id: string
          ownership_pct?: number | null
          revenue_growth_pct?: number | null
          revenue_ltm?: number | null
          risk_score?: number | null
          risk_trend?: string | null
          sector?: string
          updated_at?: string
        }
        Update: {
          cash_runway_months?: number | null
          created_at?: string
          current_valuation?: number | null
          dataset_id?: string | null
          ebitda_ltm?: number | null
          ebitda_margin_pct?: number | null
          fund_name?: string | null
          headcount?: number | null
          health_status?: string | null
          id?: string
          investment_amount?: number | null
          investment_date?: string | null
          last_board_date?: string | null
          name?: string
          next_board_date?: string | null
          notes?: string | null
          organization_id?: string
          ownership_pct?: number | null
          revenue_growth_pct?: number | null
          revenue_ltm?: number | null
          risk_score?: number | null
          risk_trend?: string | null
          sector?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_companies_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_pack_versions: {
        Row: {
          bundle_integrity_id: string
          bundle_sha256: string
          bundle_signature: string | null
          download_count: number
          generated_at: string
          generated_by: string | null
          id: string
          manifest: Json
          signature_algorithm: string | null
          size_bytes: number | null
          trust_snapshot_id: string | null
          version: string
        }
        Insert: {
          bundle_integrity_id: string
          bundle_sha256: string
          bundle_signature?: string | null
          download_count?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          manifest?: Json
          signature_algorithm?: string | null
          size_bytes?: number | null
          trust_snapshot_id?: string | null
          version: string
        }
        Update: {
          bundle_integrity_id?: string
          bundle_sha256?: string
          bundle_signature?: string | null
          download_count?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          manifest?: Json
          signature_algorithm?: string | null
          size_bytes?: number | null
          trust_snapshot_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_pack_versions_trust_snapshot_id_fkey"
            columns: ["trust_snapshot_id"]
            isOneToOne: false
            referencedRelation: "trust_metrics_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_readiness_items: {
        Row: {
          category: string
          control_key: string
          control_label: string
          evidence_payload: Json
          evidence_ref: string | null
          id: string
          last_verified_at: string | null
          snapshot_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          control_key: string
          control_label: string
          evidence_payload?: Json
          evidence_ref?: string | null
          id?: string
          last_verified_at?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          control_key?: string
          control_label?: string
          evidence_payload?: Json
          evidence_ref?: string | null
          id?: string
          last_verified_at?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_readiness_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "trust_metrics_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_datasets: {
        Row: {
          added_by: string
          created_at: string
          dataset_id: string
          id: string
          project_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          dataset_id: string
          id?: string
          project_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          dataset_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_datasets_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_datasets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_dataset_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          active_dataset_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          active_dataset_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_active_dataset_fkey"
            columns: ["active_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_active_dataset_id_fkey"
            columns: ["active_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_records: {
        Row: {
          data_origin: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string
          dataset_version_id: string | null
          id: string
          ingested_at: string
          organization_id: string
          raw_data: Json
          row_index: number
          source_name: string
          transform_error: string | null
          transform_status: string
          transformed_at: string | null
          trust_level: number
          visibility_scope: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id: string | null
        }
        Insert: {
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id: string
          dataset_version_id?: string | null
          id?: string
          ingested_at?: string
          organization_id: string
          raw_data?: Json
          row_index: number
          source_name?: string
          transform_error?: string | null
          transform_status?: string
          transformed_at?: string | null
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Update: {
          data_origin?: Database["public"]["Enums"]["data_origin_type"]
          dataset_id?: string
          dataset_version_id?: string | null
          id?: string
          ingested_at?: string
          organization_id?: string
          raw_data?: Json
          row_index?: number
          source_name?: string
          transform_error?: string | null
          transform_status?: string
          transformed_at?: string | null
          trust_level?: number
          visibility_scope?: Database["public"]["Enums"]["visibility_scope_type"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_records_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          dataset_id: string | null
          file_path: string
          generated_by: string
          id: string
          organization_id: string
          report_type: string
        }
        Insert: {
          created_at?: string
          dataset_id?: string | null
          file_path: string
          generated_by: string
          id?: string
          organization_id: string
          report_type?: string
        }
        Update: {
          created_at?: string
          dataset_id?: string | null
          file_path?: string
          generated_by?: string
          id?: string
          organization_id?: string
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          granted: boolean | null
          id: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          created_at?: string | null
          granted?: boolean | null
          id?: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          created_at?: string | null
          granted?: boolean | null
          id?: string
          organization_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_object_schemas: {
        Row: {
          api_version: string
          connector_id: string
          created_at: string
          fields: Json
          id: string
          is_custom: boolean
          last_discovered_at: string
          object_name: string
          organization_id: string
          record_count_estimate: number | null
          relationships: Json
        }
        Insert: {
          api_version: string
          connector_id: string
          created_at?: string
          fields?: Json
          id?: string
          is_custom?: boolean
          last_discovered_at?: string
          object_name: string
          organization_id: string
          record_count_estimate?: number | null
          relationships?: Json
        }
        Update: {
          api_version?: string
          connector_id?: string
          created_at?: string
          fields?: Json
          id?: string
          is_custom?: boolean
          last_discovered_at?: string
          object_name?: string
          organization_id?: string
          record_count_estimate?: number | null
          relationships?: Json
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_object_schemas_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesforce_object_schemas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_object_schemas: {
        Row: {
          api_version: string | null
          connector_id: string
          created_at: string
          entity_set: string
          entity_type: string
          fields: Json
          id: string
          is_custom: boolean
          key_fields: Json
          last_discovered_at: string
          navigation_properties: Json
          odata_version: string
          organization_id: string
          record_count_estimate: number | null
          service_name: string
        }
        Insert: {
          api_version?: string | null
          connector_id: string
          created_at?: string
          entity_set: string
          entity_type: string
          fields?: Json
          id?: string
          is_custom?: boolean
          key_fields?: Json
          last_discovered_at?: string
          navigation_properties?: Json
          odata_version?: string
          organization_id: string
          record_count_estimate?: number | null
          service_name: string
        }
        Update: {
          api_version?: string | null
          connector_id?: string
          created_at?: string
          entity_set?: string
          entity_type?: string
          fields?: Json
          id?: string
          is_custom?: boolean
          key_fields?: Json
          last_discovered_at?: string
          navigation_properties?: Json
          odata_version?: string
          organization_id?: string
          record_count_estimate?: number | null
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_object_schemas_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sap_object_schemas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_schema_drift_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          after_value: Json | null
          before_value: Json | null
          connector_id: string
          created_at: string
          detected_at: string
          drift_type: string
          entity_set: string
          entity_type: string | null
          field_name: string | null
          id: string
          operational_impact: string | null
          organization_id: string
          service_name: string
          severity: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          after_value?: Json | null
          before_value?: Json | null
          connector_id: string
          created_at?: string
          detected_at?: string
          drift_type: string
          entity_set: string
          entity_type?: string | null
          field_name?: string | null
          id?: string
          operational_impact?: string | null
          organization_id: string
          service_name: string
          severity?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          after_value?: Json | null
          before_value?: Json | null
          connector_id?: string
          created_at?: string
          detected_at?: string
          drift_type?: string
          entity_set?: string
          entity_type?: string | null
          field_name?: string | null
          id?: string
          operational_impact?: string | null
          organization_id?: string
          service_name?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "sap_schema_drift_alerts_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "data_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sap_schema_drift_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_assumptions: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          created_at: string
          id: string
          metric_type: string
          scenario_id: string
        }
        Insert: {
          adjustment_type?: string
          adjustment_value: number
          created_at?: string
          id?: string
          metric_type: string
          scenario_id: string
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          created_at?: string
          id?: string
          metric_type?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_branches: {
        Row: {
          comparison_group_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string
          parameters: Json
          results: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          comparison_group_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          parameters?: Json
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          comparison_group_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          parameters?: Json
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_results: {
        Row: {
          baseline_value: number
          created_at: string
          date: string
          delta_value: number
          id: string
          kpi_id: string
          organization_id: string
          scenario_id: string
          simulated_value: number
        }
        Insert: {
          baseline_value: number
          created_at?: string
          date: string
          delta_value: number
          id?: string
          kpi_id: string
          organization_id: string
          scenario_id: string
          simulated_value: number
        }
        Update: {
          baseline_value?: number
          created_at?: string
          date?: string
          delta_value?: number
          id?: string
          kpi_id?: string
          organization_id?: string
          scenario_id?: string
          simulated_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_results_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          created_by: string
          dataset_id: string | null
          description: string | null
          forecast_end_date: string
          forecast_start_date: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dataset_id?: string | null
          description?: string | null
          forecast_end_date: string
          forecast_start_date: string
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dataset_id?: string | null
          description?: string | null
          forecast_end_date?: string
          forecast_start_date?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_evolution_log: {
        Row: {
          change_type: string
          column_name: string | null
          created_at: string
          dataset_id: string
          detected_at: string
          detected_by: string
          id: string
          metadata: Json | null
          new_type: string | null
          old_type: string | null
          organization_id: string
          version_number: number
        }
        Insert: {
          change_type?: string
          column_name?: string | null
          created_at?: string
          dataset_id: string
          detected_at?: string
          detected_by?: string
          id?: string
          metadata?: Json | null
          new_type?: string | null
          old_type?: string | null
          organization_id: string
          version_number?: number
        }
        Update: {
          change_type?: string
          column_name?: string | null
          created_at?: string
          dataset_id?: string
          detected_at?: string
          detected_by?: string
          id?: string
          metadata?: Json | null
          new_type?: string | null
          old_type?: string | null
          organization_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "schema_evolution_log_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schema_evolution_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_tokens: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          last_used_at: string | null
          organization_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          last_used_at?: string | null
          organization_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          last_used_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_results: {
        Row: {
          capped_confidence: number | null
          confidence_cap_reason: string | null
          created_at: string
          created_by: string | null
          data_sufficiency: string
          dataset_id: string | null
          expected_value: number
          forecast_horizon: number
          id: string
          mean_growth_rate: number | null
          median_value: number
          metric_type: string
          organization_id: string
          p10_value: number
          p25_value: number
          p75_value: number
          p90_value: number
          probability_negative: number
          raw_confidence: number | null
          sample_size: number
          simulation_runs: number
          value_at_risk_95: number | null
          variance_score: number | null
          volatility: number | null
        }
        Insert: {
          capped_confidence?: number | null
          confidence_cap_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_sufficiency?: string
          dataset_id?: string | null
          expected_value: number
          forecast_horizon?: number
          id?: string
          mean_growth_rate?: number | null
          median_value: number
          metric_type: string
          organization_id: string
          p10_value: number
          p25_value: number
          p75_value: number
          p90_value: number
          probability_negative?: number
          raw_confidence?: number | null
          sample_size?: number
          simulation_runs?: number
          value_at_risk_95?: number | null
          variance_score?: number | null
          volatility?: number | null
        }
        Update: {
          capped_confidence?: number | null
          confidence_cap_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_sufficiency?: string
          dataset_id?: string | null
          expected_value?: number
          forecast_horizon?: number
          id?: string
          mean_growth_rate?: number | null
          median_value?: number
          metric_type?: string
          organization_id?: string
          p10_value?: number
          p25_value?: number
          p75_value?: number
          p90_value?: number
          probability_negative?: number
          raw_confidence?: number | null
          sample_size?: number
          simulation_runs?: number
          value_at_risk_95?: number | null
          variance_score?: number | null
          volatility?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_results_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_usage: {
        Row: {
          call_count: number
          date: string
          id: string
          organization_id: string
        }
        Insert: {
          call_count?: number
          date?: string
          id?: string
          organization_id: string
        }
        Update: {
          call_count?: number
          date?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_configs: {
        Row: {
          allowed_domains: string[] | null
          attribute_mapping: Json | null
          auto_provision: boolean
          created_at: string
          deactivate_on_removal: boolean
          enforce_sso: boolean
          id: string
          idp_certificate: string | null
          idp_entity_id: string | null
          idp_metadata_url: string | null
          idp_sso_url: string | null
          is_active: boolean
          organization_id: string
          provider_type: string
          updated_at: string
        }
        Insert: {
          allowed_domains?: string[] | null
          attribute_mapping?: Json | null
          auto_provision?: boolean
          created_at?: string
          deactivate_on_removal?: boolean
          enforce_sso?: boolean
          id?: string
          idp_certificate?: string | null
          idp_entity_id?: string | null
          idp_metadata_url?: string | null
          idp_sso_url?: string | null
          is_active?: boolean
          organization_id: string
          provider_type?: string
          updated_at?: string
        }
        Update: {
          allowed_domains?: string[] | null
          attribute_mapping?: Json | null
          auto_provision?: boolean
          created_at?: string
          deactivate_on_removal?: boolean
          enforce_sso?: boolean
          id?: string
          idp_certificate?: string | null
          idp_entity_id?: string | null
          idp_metadata_url?: string | null
          idp_sso_url?: string | null
          is_active?: boolean
          organization_id?: string
          provider_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sso_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      step_up_challenges: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      subprocessor_registry: {
        Row: {
          active: boolean
          created_at: string
          data_categories: string[]
          dpa_status: string
          hosting_location: string | null
          hosting_region: string
          id: string
          purpose: string
          retention_policy: string | null
          security_url: string | null
          service_category: string
          sort_order: number
          transfer_mechanism: string | null
          updated_at: string
          vendor_name: string
          website_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          data_categories?: string[]
          dpa_status?: string
          hosting_location?: string | null
          hosting_region: string
          id?: string
          purpose: string
          retention_policy?: string | null
          security_url?: string | null
          service_category: string
          sort_order?: number
          transfer_mechanism?: string | null
          updated_at?: string
          vendor_name: string
          website_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          data_categories?: string[]
          dpa_status?: string
          hosting_location?: string | null
          hosting_region?: string
          id?: string
          purpose?: string
          retention_policy?: string | null
          security_url?: string | null
          service_category?: string
          sort_order?: number
          transfer_mechanism?: string | null
          updated_at?: string
          vendor_name?: string
          website_url?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          grace_period_end: string | null
          id: string
          is_trial: boolean
          organization_id: string
          payment_failed_at: string | null
          price_id: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          tier: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          grace_period_end?: string | null
          id?: string
          is_trial?: boolean
          organization_id: string
          payment_failed_at?: string | null
          price_id?: string | null
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          tier?: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          grace_period_end?: string | null
          id?: string
          is_trial?: boolean
          organization_id?: string
          payment_failed_at?: string | null
          price_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          tier?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_schedules: {
        Row: {
          backoff_minutes: number
          created_at: string
          data_source_id: string
          frequency: string
          id: string
          is_active: boolean | null
          last_error: string | null
          last_run_at: string | null
          max_retries: number
          next_run_at: string | null
          organization_id: string
          retry_count: number
          run_count: number | null
          updated_at: string
        }
        Insert: {
          backoff_minutes?: number
          created_at?: string
          data_source_id: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          max_retries?: number
          next_run_at?: string | null
          organization_id: string
          retry_count?: number
          run_count?: number | null
          updated_at?: string
        }
        Update: {
          backoff_minutes?: number
          created_at?: string
          data_source_id?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          max_retries?: number
          next_run_at?: string | null
          organization_id?: string
          retry_count?: number
          run_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_schedules_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: true
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_features: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          is_allowed: boolean
          quota_limit: number | null
          quota_period: string | null
          tier: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          is_allowed?: boolean
          quota_limit?: number | null
          quota_period?: string | null
          tier: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          is_allowed?: boolean
          quota_limit?: number | null
          quota_period?: string | null
          tier?: string
        }
        Relationships: []
      }
      trust_metrics_snapshots: {
        Row: {
          audit_coverage_pct: number | null
          computed_at: string
          computed_by: string
          connector_health_pct: number | null
          dq_confidence_avg: number | null
          drift_monitor_coverage_pct: number | null
          evidence_generated_at: string
          evidence_hash: string
          evidence_scope: string
          evidence_version: string
          explainability_coverage_pct: number | null
          failed_auth_24h: number | null
          id: string
          intervention_traceability_pct: number | null
          provenance: Json
          retention_compliance_pct: number | null
          rls_coverage_pct: number | null
          snapshot_date: string
          unresolved_critical_incidents: number | null
        }
        Insert: {
          audit_coverage_pct?: number | null
          computed_at?: string
          computed_by?: string
          connector_health_pct?: number | null
          dq_confidence_avg?: number | null
          drift_monitor_coverage_pct?: number | null
          evidence_generated_at?: string
          evidence_hash: string
          evidence_scope?: string
          evidence_version?: string
          explainability_coverage_pct?: number | null
          failed_auth_24h?: number | null
          id?: string
          intervention_traceability_pct?: number | null
          provenance?: Json
          retention_compliance_pct?: number | null
          rls_coverage_pct?: number | null
          snapshot_date: string
          unresolved_critical_incidents?: number | null
        }
        Update: {
          audit_coverage_pct?: number | null
          computed_at?: string
          computed_by?: string
          connector_health_pct?: number | null
          dq_confidence_avg?: number | null
          drift_monitor_coverage_pct?: number | null
          evidence_generated_at?: string
          evidence_hash?: string
          evidence_scope?: string
          evidence_version?: string
          explainability_coverage_pct?: number | null
          failed_auth_24h?: number | null
          id?: string
          intervention_traceability_pct?: number | null
          provenance?: Json
          retention_compliance_pct?: number | null
          rls_coverage_pct?: number | null
          snapshot_date?: string
          unresolved_critical_incidents?: number | null
        }
        Relationships: []
      }
      usage_metering: {
        Row: {
          id: string
          metric_name: string
          metric_value: number
          organization_id: string
          period_date: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          id?: string
          metric_name: string
          metric_value?: number
          organization_id: string
          period_date?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          id?: string
          metric_name?: string
          metric_value?: number
          organization_id?: string
          period_date?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_metering_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_metering_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device_name: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          last_active_at: string | null
          location_info: Json | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          session_token_hash: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string | null
          location_info?: Json | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_token_hash?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string | null
          location_info?: Json | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_token_hash?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          ceremony_type: string
          challenge: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          ceremony_type: string
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          ceremony_type?: string
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          created_at: string
          credential_id: string
          device_name: string
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number | null
          transports: Json | null
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          created_at?: string
          credential_id: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number | null
          transports?: Json | null
          user_id: string
        }
        Update: {
          aaguid?: string | null
          created_at?: string
          credential_id?: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number | null
          transports?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          added_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_quotas: {
        Row: {
          created_at: string
          id: string
          max_api_calls_per_day: number
          max_copilot_queries_per_day: number
          max_datasets: number
          max_rows_per_day: number
          max_simulations_per_day: number
          max_team_seats: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_api_calls_per_day?: number
          max_copilot_queries_per_day?: number
          max_datasets?: number
          max_rows_per_day?: number
          max_simulations_per_day?: number
          max_team_seats?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_api_calls_per_day?: number
          max_copilot_queries_per_day?: number
          max_datasets?: number
          max_rows_per_day?: number
          max_simulations_per_day?: number
          max_team_seats?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_quotas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      approve_decision: {
        Args: {
          _dataset_id?: string
          _decision_id: string
          _evaluation_window_days?: number
          _expected_metric?: string
          _suggested_owner?: string
        }
        Returns: Json
      }
      blend_evidence: { Args: { _inputs: Json }; Returns: Json }
      check_decision_evaluability: {
        Args: {
          _dataset_id?: string
          _expected_metric?: string
          _org_id: string
        }
        Returns: Json
      }
      check_feature_access: {
        Args: { _feature_key: string; _org_id: string }
        Returns: Json
      }
      check_workspace_quota: {
        Args: { _metric_name: string; _workspace_id: string }
        Returns: Json
      }
      cleanup_old_copilot_messages: { Args: never; Returns: undefined }
      compute_intervention_priority: {
        Args: {
          _business_impact: number
          _decision_pressure: number
          _organizational_exposure: number
          _uncertainty: number
          _urgency: string
        }
        Returns: Json
      }
      connector_release_lock: {
        Args: { _connector_id: string }
        Returns: undefined
      }
      connector_try_lock: { Args: { _connector_id: string }; Returns: boolean }
      count_measured_outcomes: { Args: { _org_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      exec_cleanup_old_data: {
        Args: {
          _events_retain_days?: number
          _predictions_retain_days?: number
          _run_log_retain_days?: number
          _scores_retain_days?: number
        }
        Returns: Json
      }
      exec_compute_scores_idempotent: {
        Args: { _cooldown_minutes?: number; _org_id: string; _scores: Json }
        Returns: Json
      }
      exec_create_interventions_atomic: {
        Args: { _interventions: Json; _org_id: string }
        Returns: Json
      }
      exec_get_latest_events_by_plan: {
        Args: { _org_id: string; _plan_ids: string[] }
        Returns: {
          event_count: number
          execution_plan_id: string
          latest_event_at: string
        }[]
      }
      exec_infer_blockers:
        | {
            Args: { _org_id: string }
            Returns: {
              blocker_action_title: string
              blocker_status: string
              inferred_blocker_id: string
              plan_action_title: string
              plan_id: string
              reason: string
            }[]
          }
        | {
            Args: { _limit?: number; _org_id: string }
            Returns: {
              blocker_action_title: string
              blocker_status: string
              inferred_blocker_id: string
              plan_action_title: string
              plan_id: string
              reason: string
            }[]
          }
      exec_log_override: {
        Args: {
          _actor_id: string
          _changes?: Json
          _org_id: string
          _override_type: string
          _plan_id: string
          _reason: string
        }
        Returns: Json
      }
      exec_operational_metrics: { Args: { _org_id: string }; Returns: Json }
      exec_reassign_plan_atomic: {
        Args: {
          _actor_id: string
          _new_owner_id: string
          _org_id: string
          _plan_id: string
          _reason?: string
        }
        Returns: Json
      }
      exec_require_elevated_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      exec_resolve_intervention_atomic: {
        Args: { _actor_id: string; _intervention_id: string; _org_id: string }
        Returns: Json
      }
      exec_supersede_predictions: {
        Args: {
          _new_run_id: string
          _org_id: string
          _plan_ids: string[]
          _predictions: Json
        }
        Returns: Json
      }
      exec_verify_step_up_auth: {
        Args: { _org_id: string; _user_id: string; _validity_minutes?: number }
        Returns: boolean
      }
      get_active_governance_profile: {
        Args: { _org_id: string }
        Returns: {
          advisory_threshold: number
          change_reason: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          escalation_threshold: number
          governance_confidence_ceiling: number
          governance_confidence_floor: number
          governance_model: string
          id: string
          intervention_threshold: number
          organization_id: string
          risk_appetite: string
          updated_at: string
          updated_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "governance_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_active_subprocessors: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          data_categories: string[]
          dpa_status: string
          hosting_location: string | null
          hosting_region: string
          id: string
          purpose: string
          retention_policy: string | null
          security_url: string | null
          service_category: string
          sort_order: number
          transfer_mechanism: string | null
          updated_at: string
          vendor_name: string
          website_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "subprocessor_registry"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_connector_secret: { Args: { _secret_name: string }; Returns: string }
      get_cron_health: {
        Args: { _job_names: string[] }
        Returns: {
          failures_last_24h: number
          job_name: string
          last_completed_at: string
          last_duration_ms: number
          last_error: string
          last_started_at: string
          last_status: string
          runs_last_24h: number
        }[]
      }
      get_ingest_cron_secret: { Args: never; Returns: string }
      get_ingest_service_token: { Args: never; Returns: string }
      get_iq_composite_score: {
        Args: { _dataset_id: string; _org_id: string }
        Returns: Json
      }
      get_latest_trust_metrics: {
        Args: never
        Returns: {
          audit_coverage_pct: number | null
          computed_at: string
          computed_by: string
          connector_health_pct: number | null
          dq_confidence_avg: number | null
          drift_monitor_coverage_pct: number | null
          evidence_generated_at: string
          evidence_hash: string
          evidence_scope: string
          evidence_version: string
          explainability_coverage_pct: number | null
          failed_auth_24h: number | null
          id: string
          intervention_traceability_pct: number | null
          provenance: Json
          retention_compliance_pct: number | null
          rls_coverage_pct: number | null
          snapshot_date: string
          unresolved_critical_incidents: number | null
        }
        SetofOptions: {
          from: "*"
          to: "trust_metrics_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_metrics_summary: {
        Args: { _dataset_id: string; _org_id: string }
        Returns: {
          latest_date: string
          latest_value: number
          metric_type: string
          previous_half_total: number
          row_count: number
          total: number
          trend: string
        }[]
      }
      get_my_org_security_settings: {
        Args: never
        Returns: {
          ip_allowlist: string[]
          min_password_length: number
          require_mfa: boolean
          session_timeout_minutes: number
          sso_enforced: boolean
        }[]
      }
      get_procurement_readiness: {
        Args: never
        Returns: {
          category: string
          control_key: string
          control_label: string
          evidence_payload: Json
          evidence_ref: string | null
          id: string
          last_verified_at: string | null
          snapshot_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "procurement_readiness_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: { _org_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      immutable_date_trunc_hour: { Args: { ts: string }; Returns: string }
      increment_convergence_usage: {
        Args: { _org_id: string }
        Returns: undefined
      }
      increment_copilot_usage: { Args: { _org_id: string }; Returns: undefined }
      increment_rate_limit: {
        Args: { _key: string; _window_seconds?: number }
        Returns: number
      }
      increment_simulation_usage: {
        Args: { _org_id: string }
        Returns: undefined
      }
      increment_workspace_usage: {
        Args: {
          _increment?: number
          _metric_name: string
          _org_id: string
          _workspace_id: string
        }
        Returns: undefined
      }
      is_dataset_workspace_member: {
        Args: { _dataset_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      match_decision_embeddings: {
        Args: {
          filter_entity_types: string[]
          filter_org_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content_text: string
          distance: number
          entity_id: string
          entity_type: string
          metadata: Json
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      provision_aicis_for_org: { Args: { _org_id: string }; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_metric_aggregates: {
        Args: { _dataset_id?: string; _org_id: string; _period_type?: string }
        Returns: number
      }
      refresh_metric_summaries: {
        Args: { _dataset_id: string; _org_id: string }
        Returns: number
      }
      reject_decision: {
        Args: { _decision_id: string; _reason?: string }
        Returns: Json
      }
      release_cron_advisory_lock: {
        Args: { _lock_id: number }
        Returns: undefined
      }
      resolve_sso_for_email: {
        Args: { _email: string }
        Returns: {
          enforce_sso: boolean
          idp_sso_url: string
          organization_id: string
          provider_type: string
        }[]
      }
      try_cron_advisory_lock: { Args: { _lock_id: number }; Returns: boolean }
      update_dataset_staleness: { Args: never; Returns: undefined }
      upsert_vault_secret: {
        Args: { _description?: string; _name: string; _value: string }
        Returns: undefined
      }
      validate_embed_token: { Args: { _token: string }; Returns: Json }
      validate_evidence_sources: { Args: { _sources: Json }; Returns: boolean }
    }
    Enums: {
      aicis_sync_status:
        | "pending"
        | "running"
        | "success"
        | "failed"
        | "partial"
      app_role: "admin" | "analyst" | "executive" | "client_viewer"
      connector_health: "healthy" | "degraded" | "unhealthy" | "unknown"
      connector_run_status:
        | "queued"
        | "extracting"
        | "validating"
        | "extracted"
        | "transforming"
        | "transformed"
        | "aggregating"
        | "complete"
        | "partial_success"
        | "failed"
        | "cancelled"
      connector_schedule_kind: "manual" | "every_5_min" | "hourly" | "daily"
      connector_status: "active" | "paused" | "error" | "draft"
      connector_sync_mode: "full_refresh" | "append" | "incremental"
      connector_type:
        | "rest_api"
        | "csv_upload"
        | "postgres"
        | "mysql"
        | "snowflake"
        | "bigquery"
        | "webhook"
        | "sap_odata"
        | "salesforce"
        | "hubspot"
        | "dynamics"
        | "netsuite"
        | "xero"
        | "stripe"
        | "google_analytics"
        | "google_sheets"
        | "sqlserver"
        | "s3"
        | "powerbi"
      data_origin_type: "client" | "internal" | "external"
      intelligence_advisory_kind:
        | "operational"
        | "risk_mitigation"
        | "escalation"
        | "strategic"
      intelligence_feedback_kind:
        | "useful"
        | "not_useful"
        | "false_positive"
        | "acted_on"
        | "ignored"
      intelligence_status:
        | "new"
        | "scored"
        | "briefed"
        | "advised"
        | "routed"
        | "acknowledged"
        | "acted_on"
        | "resolved"
        | "archived"
      intervention_status:
        | "proposed"
        | "acknowledged"
        | "assigned"
        | "in_progress"
        | "deferred"
        | "escalated"
        | "resolved"
        | "dismissed"
      intervention_tier: "informational" | "elevated" | "high" | "critical"
      org_role:
        | "owner"
        | "admin"
        | "analyst"
        | "executive"
        | "viewer"
        | "steward"
      visibility_scope_type: "private" | "org_shared" | "global"
      workspace_role:
        | "workspace_admin"
        | "workspace_editor"
        | "workspace_viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      aicis_sync_status: ["pending", "running", "success", "failed", "partial"],
      app_role: ["admin", "analyst", "executive", "client_viewer"],
      connector_health: ["healthy", "degraded", "unhealthy", "unknown"],
      connector_run_status: [
        "queued",
        "extracting",
        "validating",
        "extracted",
        "transforming",
        "transformed",
        "aggregating",
        "complete",
        "partial_success",
        "failed",
        "cancelled",
      ],
      connector_schedule_kind: ["manual", "every_5_min", "hourly", "daily"],
      connector_status: ["active", "paused", "error", "draft"],
      connector_sync_mode: ["full_refresh", "append", "incremental"],
      connector_type: [
        "rest_api",
        "csv_upload",
        "postgres",
        "mysql",
        "snowflake",
        "bigquery",
        "webhook",
        "sap_odata",
        "salesforce",
        "hubspot",
        "dynamics",
        "netsuite",
        "xero",
        "stripe",
        "google_analytics",
        "google_sheets",
        "sqlserver",
        "s3",
        "powerbi",
      ],
      data_origin_type: ["client", "internal", "external"],
      intelligence_advisory_kind: [
        "operational",
        "risk_mitigation",
        "escalation",
        "strategic",
      ],
      intelligence_feedback_kind: [
        "useful",
        "not_useful",
        "false_positive",
        "acted_on",
        "ignored",
      ],
      intelligence_status: [
        "new",
        "scored",
        "briefed",
        "advised",
        "routed",
        "acknowledged",
        "acted_on",
        "resolved",
        "archived",
      ],
      intervention_status: [
        "proposed",
        "acknowledged",
        "assigned",
        "in_progress",
        "deferred",
        "escalated",
        "resolved",
        "dismissed",
      ],
      intervention_tier: ["informational", "elevated", "high", "critical"],
      org_role: ["owner", "admin", "analyst", "executive", "viewer", "steward"],
      visibility_scope_type: ["private", "org_shared", "global"],
      workspace_role: [
        "workspace_admin",
        "workspace_editor",
        "workspace_viewer",
      ],
    },
  },
} as const
