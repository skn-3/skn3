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
      case_costs: {
        Row: {
          amount: number
          case_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          receipt_url: string | null
        }
        Insert: {
          amount: number
          case_id: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          receipt_url?: string | null
        }
        Update: {
          amount?: number
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          receipt_url?: string | null
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
          order_value: number | null
          scheduled_delivery: boolean
          seller: string
          status: string
          tb_percent: number | null
          team: string | null
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
          order_value?: number | null
          scheduled_delivery?: boolean
          seller: string
          status?: string
          tb_percent?: number | null
          team?: string | null
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
          order_value?: number | null
          scheduled_delivery?: boolean
          seller?: string
          status?: string
          tb_percent?: number | null
          team?: string | null
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
      [_ in never]: never
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
