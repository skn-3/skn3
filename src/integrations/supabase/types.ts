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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      a_order_products: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      a_orders: {
        Row: {
          case_id: string | null
          created_at: string
          created_by: string | null
          credited_from_order_id: string | null
          customer_address: string
          customer_name: string | null
          customer_phone: string | null
          date: string
          delivery_time: string | null
          description: string | null
          door_count: number
          facade_type: string
          id: string
          images: Json
          internal_extra_amount: number | null
          internal_extra_hours: number | null
          internal_hour_rate: number | null
          invoice_number: string | null
          invoice_sent_at: string | null
          km_distance: number
          line_items: Json
          mockfjards_invoice_number: string | null
          mockfjards_order_number: string | null
          order_kind: string
          order_number: number | null
          order_sent_at: string | null
          paid_at: string | null
          paid_by: string | null
          payer: string | null
          pdf_path: string | null
          roof_window_count: number
          scheduled_delivery: boolean | null
          source_n3prenad_id: string | null
          status: string
          team_id: string | null
          total_amount: number
          window_count: number
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_from_order_id?: string | null
          customer_address: string
          customer_name?: string | null
          customer_phone?: string | null
          date?: string
          delivery_time?: string | null
          description?: string | null
          door_count?: number
          facade_type?: string
          id?: string
          images?: Json
          internal_extra_amount?: number | null
          internal_extra_hours?: number | null
          internal_hour_rate?: number | null
          invoice_number?: string | null
          invoice_sent_at?: string | null
          km_distance?: number
          line_items?: Json
          mockfjards_invoice_number?: string | null
          mockfjards_order_number?: string | null
          order_kind?: string
          order_number?: number | null
          order_sent_at?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payer?: string | null
          pdf_path?: string | null
          roof_window_count?: number
          scheduled_delivery?: boolean | null
          source_n3prenad_id?: string | null
          status?: string
          team_id?: string | null
          total_amount?: number
          window_count?: number
        }
        Update: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_from_order_id?: string | null
          customer_address?: string
          customer_name?: string | null
          customer_phone?: string | null
          date?: string
          delivery_time?: string | null
          description?: string | null
          door_count?: number
          facade_type?: string
          id?: string
          images?: Json
          internal_extra_amount?: number | null
          internal_extra_hours?: number | null
          internal_hour_rate?: number | null
          invoice_number?: string | null
          invoice_sent_at?: string | null
          km_distance?: number
          line_items?: Json
          mockfjards_invoice_number?: string | null
          mockfjards_order_number?: string | null
          order_kind?: string
          order_number?: number | null
          order_sent_at?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payer?: string | null
          pdf_path?: string | null
          roof_window_count?: number
          scheduled_delivery?: boolean | null
          source_n3prenad_id?: string | null
          status?: string
          team_id?: string | null
          total_amount?: number
          window_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "a_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "montor_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_name: string
          actor_role: string | null
          case_id: string | null
          category: string
          created_at: string
          description: string | null
          deviation_id: string | null
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_name: string
          actor_role?: string | null
          case_id?: string | null
          category: string
          created_at?: string
          description?: string | null
          deviation_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_name?: string
          actor_role?: string | null
          case_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          deviation_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_actions: {
        Row: {
          assistant_message_id: string | null
          created_at: string
          decided_at: string | null
          error: string | null
          id: string
          kind: string
          payload: Json
          result: Json | null
          status: string
          summary: string
          thread_id: string
          user_id: string
        }
        Insert: {
          assistant_message_id?: string | null
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          kind: string
          payload: Json
          result?: Json | null
          status?: string
          summary: string
          thread_id: string
          user_id: string
        }
        Update: {
          assistant_message_id?: string | null
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          result?: Json | null
          status?: string
          summary?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          action_id: string | null
          case_ids: string[]
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          action_id?: string | null
          case_ids?: string[]
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          action_id?: string | null
          case_ids?: string[]
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          daily_message_limit: number
          enabled: boolean
          extra_instructions: string | null
          gateway_error: string | null
          gateway_status: number | null
          id: number
          model: string
          updated_at: string
        }
        Insert: {
          daily_message_limit?: number
          enabled?: boolean
          extra_instructions?: string | null
          gateway_error?: string | null
          gateway_status?: number | null
          id?: number
          model?: string
          updated_at?: string
        }
        Update: {
          daily_message_limit?: number
          enabled?: boolean
          extra_instructions?: string | null
          gateway_error?: string | null
          gateway_status?: number | null
          id?: number
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_threads: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          completion_tokens: number
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          message_id: string | null
          model: string
          prompt_tokens: number
          rounds: number
          status: string
          thread_id: string | null
          tool_calls: number
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          message_id?: string | null
          model: string
          prompt_tokens?: number
          rounds?: number
          status?: string
          thread_id?: string | null
          tool_calls?: number
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          message_id?: string | null
          model?: string
          prompt_tokens?: number
          rounds?: number
          status?: string
          thread_id?: string | null
          tool_calls?: number
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      case_climate_compensation: {
        Row: {
          case_id: string
          claim_url: string | null
          created_at: string
          created_by: string | null
          kompenserad_at: string
          total_trees: number | null
          tree_count: number
          updated_at: string
          verification_id: string
        }
        Insert: {
          case_id: string
          claim_url?: string | null
          created_at?: string
          created_by?: string | null
          kompenserad_at?: string
          total_trees?: number | null
          tree_count: number
          updated_at?: string
          verification_id: string
        }
        Update: {
          case_id?: string
          claim_url?: string | null
          created_at?: string
          created_by?: string | null
          kompenserad_at?: string
          total_trees?: number | null
          tree_count?: number
          updated_at?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_climate_compensation_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_climate_compensation_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      case_costs: {
        Row: {
          a_order_id: string | null
          a_order_line_id: string | null
          amount: number
          case_id: string
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          payout_excluded_at: string | null
          payout_excluded_by: string | null
          receipt_path: string | null
          receipt_url: string | null
          responsible: string | null
        }
        Insert: {
          a_order_id?: string | null
          a_order_line_id?: string | null
          amount: number
          case_id: string
          category?: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          payout_excluded_at?: string | null
          payout_excluded_by?: string | null
          receipt_path?: string | null
          receipt_url?: string | null
          responsible?: string | null
        }
        Update: {
          a_order_id?: string | null
          a_order_line_id?: string | null
          amount?: number
          case_id?: string
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          payout_excluded_at?: string | null
          payout_excluded_by?: string | null
          receipt_path?: string | null
          receipt_url?: string | null
          responsible?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_costs_a_order_id_fkey"
            columns: ["a_order_id"]
            isOneToOne: false
            referencedRelation: "a_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_costs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_costs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string | null
          created_at: string
          currency: string | null
          customer_name: string | null
          doc_type: string
          file_name: string | null
          file_path: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          line_items: Json | null
          order_number: string | null
          payout_kind: string | null
          total_amount: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          doc_type: string
          file_name?: string | null
          file_path: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          order_number?: string | null
          payout_kind?: string | null
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          doc_type?: string
          file_name?: string | null
          file_path?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          order_number?: string | null
          payout_kind?: string | null
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          case_id: string | null
          created_at: string
          created_by: string
          description: string
          deviation_id: string | null
          event_type: string
          id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          created_by: string
          description: string
          deviation_id?: string | null
          event_type: string
          id?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          deviation_id?: string | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_deviation_id_fkey"
            columns: ["deviation_id"]
            isOneToOne: false
            referencedRelation: "deviations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          address: string
          carry_help_needed: boolean
          city: string | null
          congard_hours: number
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivery_date: string | null
          delivery_time: string | null
          delivery_week: number | null
          delivery_year: number | null
          extra_hours_approved: number
          extra_hours_requested: number
          extra_hours_sold: number
          google_drive_link: string | null
          hours_confirmed_at: string | null
          id: string
          imported: boolean
          is_gotland: boolean
          klimat_status: string | null
          km_date: string | null
          km_team: string | null
          km_time: string | null
          media_consent: boolean
          montage_date: string | null
          montage_partial_at: string | null
          montage_partial_note: string | null
          montage_time: string | null
          montor_notes: string | null
          notes: string | null
          offer_number: string | null
          order_number: string | null
          order_value: number | null
          public_token: string
          scheduled_delivery: boolean
          seller: string
          status: string
          status_changed_at: string
          tb_percent: number | null
          team: string | null
          units: number | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          address: string
          carry_help_needed?: boolean
          city?: string | null
          congard_hours?: number
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_week?: number | null
          delivery_year?: number | null
          extra_hours_approved?: number
          extra_hours_requested?: number
          extra_hours_sold?: number
          google_drive_link?: string | null
          hours_confirmed_at?: string | null
          id?: string
          imported?: boolean
          is_gotland?: boolean
          klimat_status?: string | null
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean
          montage_date?: string | null
          montage_partial_at?: string | null
          montage_partial_note?: string | null
          montage_time?: string | null
          montor_notes?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          order_value?: number | null
          public_token?: string
          scheduled_delivery?: boolean
          seller: string
          status?: string
          status_changed_at?: string
          tb_percent?: number | null
          team?: string | null
          units?: number | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          address?: string
          carry_help_needed?: boolean
          city?: string | null
          congard_hours?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_week?: number | null
          delivery_year?: number | null
          extra_hours_approved?: number
          extra_hours_requested?: number
          extra_hours_sold?: number
          google_drive_link?: string | null
          hours_confirmed_at?: string | null
          id?: string
          imported?: boolean
          is_gotland?: boolean
          klimat_status?: string | null
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean
          montage_date?: string | null
          montage_partial_at?: string | null
          montage_partial_note?: string | null
          montage_time?: string | null
          montor_notes?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          order_value?: number | null
          public_token?: string
          scheduled_delivery?: boolean
          seller?: string
          status?: string
          status_changed_at?: string
          tb_percent?: number | null
          team?: string | null
          units?: number | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      climate_events: {
        Row: {
          case_id: string | null
          claim_url: string | null
          created_at: string
          event_ref: string
          event_type: string
          id: string
          seller: string | null
          status: string | null
          total_trees: number | null
          tree_count: number
          upstream_key: string
          verification_id: string | null
          visit_id: string | null
        }
        Insert: {
          case_id?: string | null
          claim_url?: string | null
          created_at?: string
          event_ref: string
          event_type: string
          id?: string
          seller?: string | null
          status?: string | null
          total_trees?: number | null
          tree_count?: number
          upstream_key: string
          verification_id?: string | null
          visit_id?: string | null
        }
        Update: {
          case_id?: string | null
          claim_url?: string | null
          created_at?: string
          event_ref?: string
          event_type?: string
          id?: string
          seller?: string | null
          status?: string | null
          total_trees?: number | null
          tree_count?: number
          upstream_key?: string
          verification_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "climate_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "climate_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_loans: {
        Row: {
          amount: number
          consultant_id: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          invoice_number: number | null
          note: string | null
          payout_id: string | null
        }
        Insert: {
          amount: number
          consultant_id: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          invoice_number?: number | null
          note?: string | null
          payout_id?: string | null
        }
        Update: {
          amount?: number
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          invoice_number?: number | null
          note?: string | null
          payout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_loans_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_loans_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "consultant_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_payout_lines: {
        Row: {
          ai_raw: Json | null
          amount: number
          consultant_id: string
          created_at: string
          doc_date: string | null
          doc_number: string | null
          doc_number_norm: string | null
          doc_type: string | null
          drive_file_id: string | null
          drive_file_name: string | null
          drive_modified_time: string | null
          drive_web_link: string | null
          duplicate_of: string | null
          fee_amount: number | null
          id: string
          included: boolean
          is_owner_cost_candidate: boolean
          is_reminder: boolean | null
          issuer: string | null
          kind: string
          label: string
          original_amount: number | null
          payout_id: string
          reg_nr: string | null
          sort: number
        }
        Insert: {
          ai_raw?: Json | null
          amount: number
          consultant_id: string
          created_at?: string
          doc_date?: string | null
          doc_number?: string | null
          doc_number_norm?: string | null
          doc_type?: string | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_modified_time?: string | null
          drive_web_link?: string | null
          duplicate_of?: string | null
          fee_amount?: number | null
          id?: string
          included?: boolean
          is_owner_cost_candidate?: boolean
          is_reminder?: boolean | null
          issuer?: string | null
          kind: string
          label: string
          original_amount?: number | null
          payout_id: string
          reg_nr?: string | null
          sort?: number
        }
        Update: {
          ai_raw?: Json | null
          amount?: number
          consultant_id?: string
          created_at?: string
          doc_date?: string | null
          doc_number?: string | null
          doc_number_norm?: string | null
          doc_type?: string | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_modified_time?: string | null
          drive_web_link?: string | null
          duplicate_of?: string | null
          fee_amount?: number | null
          id?: string
          included?: boolean
          is_owner_cost_candidate?: boolean
          is_reminder?: boolean | null
          issuer?: string | null
          kind?: string
          label?: string
          original_amount?: number | null
          payout_id?: string
          reg_nr?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultant_payout_lines_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_payout_lines_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "consultant_payout_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_payout_lines_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "consultant_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_payouts: {
        Row: {
          archive_error: string | null
          commission_gross: number | null
          consultant_id: string
          created_at: string
          created_by: string | null
          deductions_total: number
          drive_month_folder_id: string | null
          drive_month_folder_name: string | null
          id: string
          invoice_date: string | null
          invoice_drive_file_id: string | null
          invoice_drive_link: string | null
          invoice_drive_payer_file_id: string | null
          invoice_drive_payer_folder: string | null
          invoice_drive_payer_link: string | null
          invoice_number: number | null
          invoice_pdf_path: string | null
          kind: string
          loan_change: number
          net_amount: number | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payout_month: string | null
          period_end: string | null
          period_start: string | null
          provision_file_id: string | null
          provision_file_name: string | null
          provision_payout_date: string | null
          sent_at: string | null
          sent_log: Json
          sent_to: Json | null
          source: string
          spec_drive_file_id: string | null
          spec_pdf_path: string | null
          status: string
          tb_amount: number | null
          tb_corrections: Json
          tb_needs_review: boolean
          tb_note: string | null
          tb_rows: Json
          tb_sum_corrections: number | null
          tb_sum_rows: number | null
          tier_pct: number | null
          total_incl_vat: number | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          archive_error?: string | null
          commission_gross?: number | null
          consultant_id: string
          created_at?: string
          created_by?: string | null
          deductions_total?: number
          drive_month_folder_id?: string | null
          drive_month_folder_name?: string | null
          id?: string
          invoice_date?: string | null
          invoice_drive_file_id?: string | null
          invoice_drive_link?: string | null
          invoice_drive_payer_file_id?: string | null
          invoice_drive_payer_folder?: string | null
          invoice_drive_payer_link?: string | null
          invoice_number?: number | null
          invoice_pdf_path?: string | null
          kind?: string
          loan_change?: number
          net_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payout_month?: string | null
          period_end?: string | null
          period_start?: string | null
          provision_file_id?: string | null
          provision_file_name?: string | null
          provision_payout_date?: string | null
          sent_at?: string | null
          sent_log?: Json
          sent_to?: Json | null
          source?: string
          spec_drive_file_id?: string | null
          spec_pdf_path?: string | null
          status?: string
          tb_amount?: number | null
          tb_corrections?: Json
          tb_needs_review?: boolean
          tb_note?: string | null
          tb_rows?: Json
          tb_sum_corrections?: number | null
          tb_sum_rows?: number | null
          tier_pct?: number | null
          total_incl_vat?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          archive_error?: string | null
          commission_gross?: number | null
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          deductions_total?: number
          drive_month_folder_id?: string | null
          drive_month_folder_name?: string | null
          id?: string
          invoice_date?: string | null
          invoice_drive_file_id?: string | null
          invoice_drive_link?: string | null
          invoice_drive_payer_file_id?: string | null
          invoice_drive_payer_folder?: string | null
          invoice_drive_payer_link?: string | null
          invoice_number?: number | null
          invoice_pdf_path?: string | null
          kind?: string
          loan_change?: number
          net_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payout_month?: string | null
          period_end?: string | null
          period_start?: string | null
          provision_file_id?: string | null
          provision_file_name?: string | null
          provision_payout_date?: string | null
          sent_at?: string | null
          sent_log?: Json
          sent_to?: Json | null
          source?: string
          spec_drive_file_id?: string | null
          spec_pdf_path?: string | null
          status?: string
          tb_amount?: number | null
          tb_corrections?: Json
          tb_needs_review?: boolean
          tb_note?: string | null
          tb_rows?: Json
          tb_sum_corrections?: number | null
          tb_sum_rows?: number | null
          tier_pct?: number | null
          total_incl_vat?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultant_payouts_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_previews: {
        Row: {
          commission_gross: number | null
          computed_at: string
          consultant_id: string
          deduction_file_count: number | null
          error: string | null
          existing_payout_id: string | null
          folder_created_time: string | null
          folder_id: string | null
          folder_name: string | null
          net_estimate: number | null
          payout_month: string | null
          period_end: string | null
          period_start: string | null
          provision_file_id: string | null
          provision_file_name: string | null
          provision_modified_time: string | null
          provision_payout_date: string | null
          standard_deductions: number | null
          state: string
          tb_amount: number | null
          tb_needs_review: boolean | null
          tb_note: string | null
          tier_pct: number | null
          total_estimate: number | null
          vat_estimate: number | null
        }
        Insert: {
          commission_gross?: number | null
          computed_at?: string
          consultant_id: string
          deduction_file_count?: number | null
          error?: string | null
          existing_payout_id?: string | null
          folder_created_time?: string | null
          folder_id?: string | null
          folder_name?: string | null
          net_estimate?: number | null
          payout_month?: string | null
          period_end?: string | null
          period_start?: string | null
          provision_file_id?: string | null
          provision_file_name?: string | null
          provision_modified_time?: string | null
          provision_payout_date?: string | null
          standard_deductions?: number | null
          state?: string
          tb_amount?: number | null
          tb_needs_review?: boolean | null
          tb_note?: string | null
          tier_pct?: number | null
          total_estimate?: number | null
          vat_estimate?: number | null
        }
        Update: {
          commission_gross?: number | null
          computed_at?: string
          consultant_id?: string
          deduction_file_count?: number | null
          error?: string | null
          existing_payout_id?: string | null
          folder_created_time?: string | null
          folder_id?: string | null
          folder_name?: string | null
          net_estimate?: number | null
          payout_month?: string | null
          period_end?: string | null
          period_start?: string | null
          provision_file_id?: string | null
          provision_file_name?: string | null
          provision_modified_time?: string | null
          provision_payout_date?: string | null
          standard_deductions?: number | null
          state?: string
          tb_amount?: number | null
          tb_needs_review?: boolean | null
          tb_note?: string | null
          tier_pct?: number | null
          total_estimate?: number | null
          vat_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_previews_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: true
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      consultants: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          cc_email: string | null
          commission_tiers: Json
          company_name: string
          created_at: string
          drive_folder_id: string | null
          drive_payer_root_id: string | null
          email: string | null
          id: string
          is_active: boolean
          log_backfilled_at: string | null
          log_sheet_id: string | null
          name: string
          next_invoice_number: number
          org_nr: string | null
          payer_address: string | null
          payer_email: string | null
          payer_fiscal_start_month: number
          payer_name: string
          payer_org_nr: string | null
          payer_vat_nr: string | null
          standard_deductions: Json
          updated_at: string
          user_id: string | null
          vat_nr: string | null
          vat_rate: number
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          cc_email?: string | null
          commission_tiers?: Json
          company_name: string
          created_at?: string
          drive_folder_id?: string | null
          drive_payer_root_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          log_backfilled_at?: string | null
          log_sheet_id?: string | null
          name: string
          next_invoice_number?: number
          org_nr?: string | null
          payer_address?: string | null
          payer_email?: string | null
          payer_fiscal_start_month?: number
          payer_name: string
          payer_org_nr?: string | null
          payer_vat_nr?: string | null
          standard_deductions?: Json
          updated_at?: string
          user_id?: string | null
          vat_nr?: string | null
          vat_rate?: number
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          cc_email?: string | null
          commission_tiers?: Json
          company_name?: string
          created_at?: string
          drive_folder_id?: string | null
          drive_payer_root_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          log_backfilled_at?: string | null
          log_sheet_id?: string | null
          name?: string
          next_invoice_number?: number
          org_nr?: string | null
          payer_address?: string | null
          payer_email?: string | null
          payer_fiscal_start_month?: number
          payer_name?: string
          payer_org_nr?: string | null
          payer_vat_nr?: string | null
          standard_deductions?: Json
          updated_at?: string
          user_id?: string | null
          vat_nr?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      deviations: {
        Row: {
          action_log: Json
          action_needed: string | null
          action_taken_at: string | null
          action_type: string | null
          address: string | null
          ball: string
          case_id: string | null
          cost: number | null
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          del1_delivery_week: number | null
          del1_delivery_year: number | null
          del1_order_number: string | null
          description: string
          factory_email_sent_at: string | null
          factory_email_to: string | null
          id: string
          image_urls: string[] | null
          last_event_at: string | null
          merged_into_id: string | null
          next_step: string | null
          next_step_due: string | null
          next_step_owner: string | null
          owner: string | null
          priority: string
          reminder_count: number | null
          resolved: boolean
          resolved_at: string | null
          responsible: string
          status: string
          ticket_no: number
          title: string | null
          type: string
        }
        Insert: {
          action_log?: Json
          action_needed?: string | null
          action_taken_at?: string | null
          action_type?: string | null
          address?: string | null
          ball?: string
          case_id?: string | null
          cost?: number | null
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          del1_delivery_week?: number | null
          del1_delivery_year?: number | null
          del1_order_number?: string | null
          description: string
          factory_email_sent_at?: string | null
          factory_email_to?: string | null
          id?: string
          image_urls?: string[] | null
          last_event_at?: string | null
          merged_into_id?: string | null
          next_step?: string | null
          next_step_due?: string | null
          next_step_owner?: string | null
          owner?: string | null
          priority?: string
          reminder_count?: number | null
          resolved?: boolean
          resolved_at?: string | null
          responsible: string
          status?: string
          ticket_no?: never
          title?: string | null
          type: string
        }
        Update: {
          action_log?: Json
          action_needed?: string | null
          action_taken_at?: string | null
          action_type?: string | null
          address?: string | null
          ball?: string
          case_id?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          del1_delivery_week?: number | null
          del1_delivery_year?: number | null
          del1_order_number?: string | null
          description?: string
          factory_email_sent_at?: string | null
          factory_email_to?: string | null
          id?: string
          image_urls?: string[] | null
          last_event_at?: string | null
          merged_into_id?: string | null
          next_step?: string | null
          next_step_due?: string | null
          next_step_owner?: string | null
          owner?: string | null
          priority?: string
          reminder_count?: number | null
          resolved?: boolean
          resolved_at?: string | null
          responsible?: string
          status?: string
          ticket_no?: never
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deviations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "deviations"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync: {
        Row: {
          attempts: number
          created_at: string
          doc_kind: string
          drive_file_id: string | null
          drive_folder_id: string | null
          drive_folder_path: string | null
          drive_web_link: string | null
          error: string | null
          file_name: string
          id: string
          source_id: string
          source_table: string
          status: string
          storage_path: string
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          doc_kind: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          drive_folder_path?: string | null
          drive_web_link?: string | null
          error?: string | null
          file_name: string
          id?: string
          source_id: string
          source_table: string
          status?: string
          storage_path: string
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          doc_kind?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          drive_folder_path?: string | null
          drive_web_link?: string | null
          error?: string | null
          file_name?: string
          id?: string
          source_id?: string
          source_table?: string
          status?: string
          storage_path?: string
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      drive_sync_runtime: {
        Row: {
          callback_bearer: string | null
          callback_url: string | null
          generation: number
          id: number
          lease_owner: string | null
          lease_until: string | null
        }
        Insert: {
          callback_bearer?: string | null
          callback_url?: string | null
          generation?: number
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
        }
        Update: {
          callback_bearer?: string | null
          callback_url?: string | null
          generation?: number
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      drive_sync_settings: {
        Row: {
          enabled: boolean
          id: number
          kunder_folder_id: string
          last_error: string | null
          last_run_at: string | null
          root_folder_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          kunder_folder_id?: string
          last_error?: string | null
          last_run_at?: string | null
          root_folder_id?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          kunder_folder_id?: string
          last_error?: string | null
          last_run_at?: string | null
          root_folder_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      future_jobs: {
        Row: {
          address: string | null
          case_id: string | null
          contact_date: string
          created_at: string
          created_by: string | null
          customer_name: string
          description: string
          id: string
          phone: string | null
          reminded_at: string | null
          seller: string
          status: string
        }
        Insert: {
          address?: string | null
          case_id?: string | null
          contact_date: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          description: string
          id?: string
          phone?: string | null
          reminded_at?: string | null
          seller: string
          status?: string
        }
        Update: {
          address?: string | null
          case_id?: string | null
          contact_date?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          description?: string
          id?: string
          phone?: string | null
          reminded_at?: string | null
          seller?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "future_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_history: {
        Row: {
          id: string
          insight_id: string
          shown_at: string
          user_name: string
        }
        Insert: {
          id?: string
          insight_id: string
          shown_at?: string
          user_name: string
        }
        Update: {
          id?: string
          insight_id?: string
          shown_at?: string
          user_name?: string
        }
        Relationships: []
      }
      litteror: {
        Row: {
          antal: number | null
          article_code: string | null
          article_name: string | null
          brostning: number | null
          brostning_mod: string | null
          case_id: string
          cm_status: string
          color_inside: string | null
          color_outside: string | null
          created_at: string
          height: number | null
          height_mod: string | null
          id: string
          imported_snapshot: Json | null
          littera: string | null
          montor_note: string | null
          set_lead: boolean | null
          set_number: number | null
          set_position: number | null
          sort_order: number
          spec: Json
          u_varde: number | null
          vikt: number | null
          width: number | null
          width_mod: string | null
        }
        Insert: {
          antal?: number | null
          article_code?: string | null
          article_name?: string | null
          brostning?: number | null
          brostning_mod?: string | null
          case_id: string
          cm_status?: string
          color_inside?: string | null
          color_outside?: string | null
          created_at?: string
          height?: number | null
          height_mod?: string | null
          id?: string
          imported_snapshot?: Json | null
          littera?: string | null
          montor_note?: string | null
          set_lead?: boolean | null
          set_number?: number | null
          set_position?: number | null
          sort_order?: number
          spec?: Json
          u_varde?: number | null
          vikt?: number | null
          width?: number | null
          width_mod?: string | null
        }
        Update: {
          antal?: number | null
          article_code?: string | null
          article_name?: string | null
          brostning?: number | null
          brostning_mod?: string | null
          case_id?: string
          cm_status?: string
          color_inside?: string | null
          color_outside?: string | null
          created_at?: string
          height?: number | null
          height_mod?: string | null
          id?: string
          imported_snapshot?: Json | null
          littera?: string | null
          montor_note?: string | null
          set_lead?: boolean | null
          set_number?: number | null
          set_position?: number | null
          sort_order?: number
          spec?: Json
          u_varde?: number | null
          vikt?: number | null
          width?: number | null
          width_mod?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "litteror_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "litteror_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          case_id: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          case_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          case_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      montor_debit_invoices: {
        Row: {
          case_id: string | null
          created_at: string
          created_by: string | null
          credited_from_invoice_id: string | null
          date: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          kind: string
          line_items: Json
          paid_at: string | null
          pdf_path: string | null
          sent_at: string | null
          status: string
          subtotal: number
          team_id: string
          title: string | null
          total: number
          vat_amount: number
          vat_mode: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_from_invoice_id?: string | null
          date?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          kind?: string
          line_items?: Json
          paid_at?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          team_id: string
          title?: string | null
          total?: number
          vat_amount?: number
          vat_mode?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_from_invoice_id?: string | null
          date?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          kind?: string
          line_items?: Json
          paid_at?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          team_id?: string
          title?: string | null
          total?: number
          vat_amount?: number
          vat_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "montor_debit_invoices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "montor_debit_invoices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "montor_debit_invoices_credited_from_invoice_id_fkey"
            columns: ["credited_from_invoice_id"]
            isOneToOne: false
            referencedRelation: "montor_debit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "montor_debit_invoices_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "montor_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      montor_teams: {
        Row: {
          address: string | null
          bankgiro: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          invoice_email: string | null
          invoice_prefix: string | null
          is_active: boolean
          name: string
          next_invoice_number: number
          org_nr: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          bankgiro?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_email?: string | null
          invoice_prefix?: string | null
          is_active?: boolean
          name: string
          next_invoice_number?: number
          org_nr?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          bankgiro?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_email?: string | null
          invoice_prefix?: string | null
          is_active?: boolean
          name?: string
          next_invoice_number?: number
          org_nr?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          link: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      number_counters: {
        Row: {
          counter: number
          series: string
          year: number
        }
        Insert: {
          counter?: number
          series: string
          year: number
        }
        Update: {
          counter?: number
          series?: string
          year?: number
        }
        Relationships: []
      }
      offers: {
        Row: {
          accept_ip: string | null
          accept_name: string | null
          accept_user_agent: string | null
          accepted_at: string | null
          case_id: string | null
          confirmation_pdf_path: string | null
          confirmation_sent_at: string | null
          confirmation_sent_by: string | null
          confirmation_sent_to: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_personnummer: string | null
          customer_phone: string | null
          customer_type: string
          decline_name: string | null
          decline_reason: string | null
          declined_at: string | null
          description: string | null
          fastighetsbeteckning: string | null
          handpenning_percent: number
          id: string
          internal_notes: string | null
          line_items: Json
          markup_percent: number | null
          offer_number: string | null
          payment_terms: string | null
          pdf_path: string | null
          public_token: string | null
          rot_amount: number | null
          rot_base: number | null
          rot_cap_per_person: number
          rot_enabled: boolean
          rot_percent: number
          rot_persons: number
          rot_used: number
          sent_at: string | null
          signed_pdf_path: string | null
          source: string
          status: string
          terms_text: string | null
          title: string | null
          total_after_rot: number | null
          total_ex_vat: number | null
          total_incl_vat: number | null
          total_vat: number | null
          ue_document_path: string | null
          ue_supplier: string | null
          ue_total_excl: number | null
          updated_at: string
          valid_until: string | null
          vat_mode: string
          vat_rate: number
        }
        Insert: {
          accept_ip?: string | null
          accept_name?: string | null
          accept_user_agent?: string | null
          accepted_at?: string | null
          case_id?: string | null
          confirmation_pdf_path?: string | null
          confirmation_sent_at?: string | null
          confirmation_sent_by?: string | null
          confirmation_sent_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_personnummer?: string | null
          customer_phone?: string | null
          customer_type?: string
          decline_name?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string | null
          fastighetsbeteckning?: string | null
          handpenning_percent?: number
          id?: string
          internal_notes?: string | null
          line_items?: Json
          markup_percent?: number | null
          offer_number?: string | null
          payment_terms?: string | null
          pdf_path?: string | null
          public_token?: string | null
          rot_amount?: number | null
          rot_base?: number | null
          rot_cap_per_person?: number
          rot_enabled?: boolean
          rot_percent?: number
          rot_persons?: number
          rot_used?: number
          sent_at?: string | null
          signed_pdf_path?: string | null
          source?: string
          status?: string
          terms_text?: string | null
          title?: string | null
          total_after_rot?: number | null
          total_ex_vat?: number | null
          total_incl_vat?: number | null
          total_vat?: number | null
          ue_document_path?: string | null
          ue_supplier?: string | null
          ue_total_excl?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_mode?: string
          vat_rate?: number
        }
        Update: {
          accept_ip?: string | null
          accept_name?: string | null
          accept_user_agent?: string | null
          accepted_at?: string | null
          case_id?: string | null
          confirmation_pdf_path?: string | null
          confirmation_sent_at?: string | null
          confirmation_sent_by?: string | null
          confirmation_sent_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_personnummer?: string | null
          customer_phone?: string | null
          customer_type?: string
          decline_name?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string | null
          fastighetsbeteckning?: string | null
          handpenning_percent?: number
          id?: string
          internal_notes?: string | null
          line_items?: Json
          markup_percent?: number | null
          offer_number?: string | null
          payment_terms?: string | null
          pdf_path?: string | null
          public_token?: string | null
          rot_amount?: number | null
          rot_base?: number | null
          rot_cap_per_person?: number
          rot_enabled?: boolean
          rot_percent?: number
          rot_persons?: number
          rot_used?: number
          sent_at?: string | null
          signed_pdf_path?: string | null
          source?: string
          status?: string
          terms_text?: string | null
          title?: string | null
          total_after_rot?: number | null
          total_ex_vat?: number | null
          total_incl_vat?: number | null
          total_vat?: number | null
          ue_document_path?: string | null
          ue_supplier?: string | null
          ue_total_excl?: number | null
          updated_at?: string
          valid_until?: string | null
          vat_mode?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      order_climate_compensation: {
        Row: {
          created_at: string
          created_by: string | null
          klimat_kompenserad_at: string
          klimat_tree_count: number
          klimat_verification_id: string
          order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          klimat_kompenserad_at?: string
          klimat_tree_count: number
          klimat_verification_id: string
          order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          klimat_kompenserad_at?: string
          klimat_tree_count?: number
          klimat_verification_id?: string
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_climate_compensation_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "a_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          login_email: string
          must_change_pin: boolean
          name: string
          pin_change_requested_at: string | null
        }
        Insert: {
          created_at?: string
          id: string
          login_email: string
          must_change_pin?: boolean
          name: string
          pin_change_requested_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          login_email?: string
          must_change_pin?: boolean
          name?: string
          pin_change_requested_at?: string | null
        }
        Relationships: []
      }
      sheet_metal_orders: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          delivery_address: string
          id: string
          montor_name: string | null
          montor_phone: string | null
          notes: string | null
          profiles: Json
          status: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          delivery_address: string
          id?: string
          montor_name?: string | null
          montor_phone?: string | null
          notes?: string | null
          profiles?: Json
          status?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          delivery_address?: string
          id?: string
          montor_name?: string | null
          montor_phone?: string | null
          notes?: string | null
          profiles?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_metal_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_metal_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
      uppdrag: {
        Row: {
          assigned_to: string | null
          cost_ex_vat: number | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_personnummer: string | null
          customer_phone: string | null
          customer_type: string | null
          done_date: string | null
          fastighetsbeteckning: string | null
          handpenning_amount: number | null
          handpenning_invoice_date: string | null
          handpenning_invoice_no: string | null
          handpenning_pdf_path: string | null
          handpenning_sent_at: string | null
          id: string
          notes: string | null
          offer_id: string | null
          paid_at: string | null
          revenue_after_rot: number | null
          revenue_ex_vat: number | null
          revenue_incl_vat: number | null
          rot_amount: number | null
          slutfaktura_amount: number | null
          slutfaktura_invoice_date: string | null
          slutfaktura_invoice_no: string | null
          slutfaktura_pdf_path: string | null
          slutfaktura_sent_at: string | null
          start_date: string | null
          status: string
          title: string | null
          updated_at: string
          uppdrag_number: string | null
        }
        Insert: {
          assigned_to?: string | null
          cost_ex_vat?: number | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_personnummer?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          done_date?: string | null
          fastighetsbeteckning?: string | null
          handpenning_amount?: number | null
          handpenning_invoice_date?: string | null
          handpenning_invoice_no?: string | null
          handpenning_pdf_path?: string | null
          handpenning_sent_at?: string | null
          id?: string
          notes?: string | null
          offer_id?: string | null
          paid_at?: string | null
          revenue_after_rot?: number | null
          revenue_ex_vat?: number | null
          revenue_incl_vat?: number | null
          rot_amount?: number | null
          slutfaktura_amount?: number | null
          slutfaktura_invoice_date?: string | null
          slutfaktura_invoice_no?: string | null
          slutfaktura_pdf_path?: string | null
          slutfaktura_sent_at?: string | null
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          uppdrag_number?: string | null
        }
        Update: {
          assigned_to?: string | null
          cost_ex_vat?: number | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_personnummer?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          done_date?: string | null
          fastighetsbeteckning?: string | null
          handpenning_amount?: number | null
          handpenning_invoice_date?: string | null
          handpenning_invoice_no?: string | null
          handpenning_pdf_path?: string | null
          handpenning_sent_at?: string | null
          id?: string
          notes?: string | null
          offer_id?: string | null
          paid_at?: string | null
          revenue_after_rot?: number | null
          revenue_ex_vat?: number | null
          revenue_incl_vat?: number | null
          rot_amount?: number | null
          slutfaktura_amount?: number | null
          slutfaktura_invoice_date?: string | null
          slutfaktura_invoice_no?: string | null
          slutfaktura_pdf_path?: string | null
          slutfaktura_sent_at?: string | null
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          uppdrag_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uppdrag_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_tokens: {
        Row: {
          created_at: string
          token: string
          user_name: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_name: string
        }
        Update: {
          created_at?: string
          token?: string
          user_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          is_admin: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_admin?: boolean
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_admin?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          address: string
          case_id: string | null
          created_at: string
          customer_name: string
          date: string
          email: string | null
          follow_up_count: number
          follow_up_date: string | null
          id: string
          last_follow_up_at: string | null
          lost: boolean | null
          lost_comment: string | null
          lost_competitor: string | null
          lost_reason: string | null
          notes: string | null
          order_value: number | null
          result: string
          seller: string
        }
        Insert: {
          address: string
          case_id?: string | null
          created_at?: string
          customer_name: string
          date: string
          email?: string | null
          follow_up_count?: number
          follow_up_date?: string | null
          id?: string
          last_follow_up_at?: string | null
          lost?: boolean | null
          lost_comment?: string | null
          lost_competitor?: string | null
          lost_reason?: string | null
          notes?: string | null
          order_value?: number | null
          result: string
          seller: string
        }
        Update: {
          address?: string
          case_id?: string | null
          created_at?: string
          customer_name?: string
          date?: string
          email?: string | null
          follow_up_count?: number
          follow_up_date?: string | null
          id?: string
          last_follow_up_at?: string | null
          lost?: boolean | null
          lost_comment?: string | null
          lost_competitor?: string | null
          lost_reason?: string | null
          notes?: string | null
          order_value?: number | null
          result?: string
          seller?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_montor"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cases_montor: {
        Row: {
          address: string | null
          carry_help_needed: boolean | null
          city: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_date: string | null
          delivery_time: string | null
          delivery_week: number | null
          delivery_year: number | null
          extra_hours_approved: number | null
          extra_hours_requested: number | null
          id: string | null
          imported: boolean | null
          is_gotland: boolean | null
          klimat_status: string | null
          km_date: string | null
          km_team: string | null
          km_time: string | null
          media_consent: boolean | null
          montage_date: string | null
          montage_partial_at: string | null
          montage_partial_note: string | null
          montage_time: string | null
          montor_notes: string | null
          notes: string | null
          offer_number: string | null
          order_number: string | null
          public_token: string | null
          scheduled_delivery: boolean | null
          seller: string | null
          status: string | null
          status_changed_at: string | null
          team: string | null
          units: number | null
          updated_at: string | null
          visit_id: string | null
        }
        Insert: {
          address?: string | null
          carry_help_needed?: boolean | null
          city?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_week?: number | null
          delivery_year?: number | null
          extra_hours_approved?: number | null
          extra_hours_requested?: number | null
          id?: string | null
          imported?: boolean | null
          is_gotland?: boolean | null
          klimat_status?: string | null
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean | null
          montage_date?: string | null
          montage_partial_at?: string | null
          montage_partial_note?: string | null
          montage_time?: string | null
          montor_notes?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          public_token?: string | null
          scheduled_delivery?: boolean | null
          seller?: string | null
          status?: string | null
          status_changed_at?: string | null
          team?: string | null
          units?: number | null
          updated_at?: string | null
          visit_id?: string | null
        }
        Update: {
          address?: string | null
          carry_help_needed?: boolean | null
          city?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_week?: number | null
          delivery_year?: number | null
          extra_hours_approved?: number | null
          extra_hours_requested?: number | null
          id?: string | null
          imported?: boolean | null
          is_gotland?: boolean | null
          klimat_status?: string | null
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean | null
          montage_date?: string | null
          montage_partial_at?: string | null
          montage_partial_note?: string | null
          montage_time?: string | null
          montor_notes?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          public_token?: string | null
          scheduled_delivery?: boolean | null
          seller?: string | null
          status?: string | null
          status_changed_at?: string | null
          team?: string | null
          units?: number | null
          updated_at?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          id: string | null
          name: string | null
          role: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_archive_thread: { Args: never; Returns: undefined }
      ai_begin_message: {
        Args: { p_message: string; p_user_id: string }
        Returns: Json
      }
      ai_claim_action: {
        Args: { p_action_id: string; p_user_id: string }
        Returns: Json
      }
      ai_create_proposal: {
        Args: {
          p_kind: string
          p_payload: Json
          p_summary: string
          p_thread_id: string
          p_user_id: string
        }
        Returns: string
      }
      append_deviation_log: {
        Args: { p_deviation_id: string; p_entry: Json }
        Returns: undefined
      }
      auth_is_admin: { Args: never; Returns: boolean }
      auth_is_my_team_case: { Args: { p_case_id: string }; Returns: boolean }
      auth_user_name: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
      consultant_next_invoice_number: {
        Args: { p_consultant_id: string }
        Returns: number
      }
      drive_sync_claim: { Args: { p_owner: string }; Returns: number }
      drive_sync_finish: {
        Args: { p_generation: number; p_owner: string; p_remaining: boolean }
        Returns: undefined
      }
      drive_sync_wake: { Args: never; Returns: undefined }
      fix_a_order_sequence: { Args: never; Returns: undefined }
      is_conversation_member: { Args: { p_id: string }; Returns: boolean }
      is_montor_name: { Args: { p_name: string }; Returns: boolean }
      login_directory: {
        Args: never
        Returns: {
          name: string
          role: string
        }[]
      }
      next_team_invoice_number: { Args: { p_team_id: string }; Returns: string }
      next_yearly_number: { Args: { p_series: string }; Returns: string }
      notify_montor_team: {
        Args: {
          p_actor: string
          p_body: string
          p_kind: string
          p_link: Json
          p_team_name: string
          p_title: string
        }
        Returns: undefined
      }
      notify_staff: {
        Args: {
          p_actor: string
          p_body: string
          p_kind: string
          p_link: Json
          p_seller_name: string
          p_title: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_actor: string
          p_body: string
          p_kind: string
          p_link: Json
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      start_conversation: {
        Args: { p_title?: string; p_user_ids: string[] }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
