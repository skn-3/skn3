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
          order_number: number | null
          order_sent_at: string | null
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
          order_number?: number | null
          order_sent_at?: string | null
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
          order_number?: number | null
          order_sent_at?: string | null
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
      case_costs: {
        Row: {
          amount: number
          case_id: string
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          receipt_url: string | null
          responsible: string | null
        }
        Insert: {
          amount: number
          case_id: string
          category?: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          receipt_url?: string | null
          responsible?: string | null
        }
        Update: {
          amount?: number
          case_id?: string
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          receipt_url?: string | null
          responsible?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_costs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
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
          total_amount: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
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
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
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
        ]
      }
      case_events: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          description: string
          event_type: string
          id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          description: string
          event_type: string
          id?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string
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
        ]
      }
      cases: {
        Row: {
          address: string
          carry_help_needed: boolean
          city: string | null
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
          id: string
          imported: boolean
          km_date: string | null
          km_team: string | null
          km_time: string | null
          media_consent: boolean
          montage_date: string | null
          montage_time: string | null
          notes: string | null
          offer_number: string | null
          order_number: string | null
          order_value: number | null
          scheduled_delivery: boolean
          seller: string
          status: string
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
          id?: string
          imported?: boolean
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean
          montage_date?: string | null
          montage_time?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          order_value?: number | null
          scheduled_delivery?: boolean
          seller: string
          status?: string
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
          id?: string
          imported?: boolean
          km_date?: string | null
          km_team?: string | null
          km_time?: string | null
          media_consent?: boolean
          montage_date?: string | null
          montage_time?: string | null
          notes?: string | null
          offer_number?: string | null
          order_number?: string | null
          order_value?: number | null
          scheduled_delivery?: boolean
          seller?: string
          status?: string
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
      deviations: {
        Row: {
          action_log: Json
          action_needed: string | null
          action_taken_at: string | null
          action_type: string | null
          case_id: string
          cost: number | null
          created_at: string
          created_by: string
          del1_delivery_week: number | null
          del1_delivery_year: number | null
          del1_order_number: string | null
          description: string
          factory_email_sent_at: string | null
          factory_email_to: string | null
          id: string
          image_urls: string[] | null
          reminder_count: number | null
          resolved: boolean
          resolved_at: string | null
          responsible: string
          status: string
          type: string
        }
        Insert: {
          action_log?: Json
          action_needed?: string | null
          action_taken_at?: string | null
          action_type?: string | null
          case_id: string
          cost?: number | null
          created_at?: string
          created_by: string
          del1_delivery_week?: number | null
          del1_delivery_year?: number | null
          del1_order_number?: string | null
          description: string
          factory_email_sent_at?: string | null
          factory_email_to?: string | null
          id?: string
          image_urls?: string[] | null
          reminder_count?: number | null
          resolved?: boolean
          resolved_at?: string | null
          responsible: string
          status?: string
          type: string
        }
        Update: {
          action_log?: Json
          action_needed?: string | null
          action_taken_at?: string | null
          action_type?: string | null
          case_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string
          del1_delivery_week?: number | null
          del1_delivery_year?: number | null
          del1_order_number?: string | null
          description?: string
          factory_email_sent_at?: string | null
          factory_email_to?: string | null
          id?: string
          image_urls?: string[] | null
          reminder_count?: number | null
          resolved?: boolean
          resolved_at?: string | null
          responsible?: string
          status?: string
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
          rot_enabled: boolean
          rot_percent: number
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
          rot_enabled?: boolean
          rot_percent?: number
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
          rot_enabled?: boolean
          rot_percent?: number
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
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          login_email: string
          must_change_pin: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          login_email: string
          must_change_pin?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          login_email?: string
          must_change_pin?: boolean
          name?: string
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
          handpenning_invoice_no: string | null
          handpenning_pdf_path: string | null
          handpenning_sent_at: string | null
          id: string
          notes: string | null
          offer_id: string | null
          revenue_after_rot: number | null
          revenue_ex_vat: number | null
          revenue_incl_vat: number | null
          rot_amount: number | null
          slutfaktura_amount: number | null
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
          handpenning_invoice_no?: string | null
          handpenning_pdf_path?: string | null
          handpenning_sent_at?: string | null
          id?: string
          notes?: string | null
          offer_id?: string | null
          revenue_after_rot?: number | null
          revenue_ex_vat?: number | null
          revenue_incl_vat?: number | null
          rot_amount?: number | null
          slutfaktura_amount?: number | null
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
          handpenning_invoice_no?: string | null
          handpenning_pdf_path?: string | null
          handpenning_sent_at?: string | null
          id?: string
          notes?: string | null
          offer_id?: string | null
          revenue_after_rot?: number | null
          revenue_ex_vat?: number | null
          revenue_incl_vat?: number | null
          rot_amount?: number | null
          slutfaktura_amount?: number | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_is_admin: { Args: never; Returns: boolean }
      auth_is_my_team_case: { Args: { p_case_id: string }; Returns: boolean }
      auth_user_name: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
