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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string
          description: string | null
          drive_file_id: string | null
          drive_url: string | null
          entity_id: string | null
          entity_type: string
          file_name: string
          file_size: number
          id: string
          kind: string
          mime_type: string
          status: Database["public"]["Enums"]["attachment_status"]
          temp_storage_path: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          entity_id?: string | null
          entity_type: string
          file_name: string
          file_size: number
          id?: string
          kind?: string
          mime_type: string
          status?: Database["public"]["Enums"]["attachment_status"]
          temp_storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          entity_id?: string | null
          entity_type?: string
          file_name?: string
          file_size?: number
          id?: string
          kind?: string
          mime_type?: string
          status?: Database["public"]["Enums"]["attachment_status"]
          temp_storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buyers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          instagram: string | null
          notes: string | null
          phone: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          instagram?: string | null
          notes?: string | null
          phone: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          instagram?: string | null
          notes?: string | null
          phone?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["transaction_type"]
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["transaction_type"]
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["transaction_type"]
          name?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount_cents: number
          attachment_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          notes: string | null
          occurred_on: string
          origin: string | null
          payment_method_id: string | null
          raffle_id: string | null
          responsible_id: string | null
          supplier_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attachment_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          notes?: string | null
          occurred_on: string
          origin?: string | null
          payment_method_id?: string | null
          raffle_id?: string | null
          responsible_id?: string | null
          supplier_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attachment_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          origin?: string | null
          payment_method_id?: string | null
          raffle_id?: string | null
          responsible_id?: string | null
          supplier_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "public_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "public_raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payment_records: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          paid_at: string
          payment_method_id: string
          reference_note: string | null
          sale_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          paid_at?: string
          payment_method_id: string
          reference_note?: string | null
          sale_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          paid_at?: string
          payment_method_id?: string
          reference_note?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "public_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "raffle_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      raffle_points: {
        Row: {
          id: string
          point_number: number
          raffle_id: string
          reservation_token: string | null
          reserved_until: string | null
          status: Database["public"]["Enums"]["point_status"]
          updated_at: string
        }
        Insert: {
          id?: string
          point_number: number
          raffle_id: string
          reservation_token?: string | null
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["point_status"]
          updated_at?: string
        }
        Update: {
          id?: string
          point_number?: number
          raffle_id?: string
          reservation_token?: string | null
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["point_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffle_points_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "public_raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_points_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_sale_points: {
        Row: {
          point_id: string
          sale_id: string
        }
        Insert: {
          point_id: string
          sale_id: string
        }
        Update: {
          point_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffle_sale_points_point_id_fkey"
            columns: ["point_id"]
            isOneToOne: false
            referencedRelation: "raffle_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sale_points_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "raffle_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_sales: {
        Row: {
          amount_cents: number
          buyer_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          id: string
          idempotency_key: string
          payment_method_id: string
          raffle_id: string
          seller_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
        }
        Insert: {
          amount_cents: number
          buyer_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          payment_method_id: string
          raffle_id: string
          seller_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
        }
        Update: {
          amount_cents?: number
          buyer_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          payment_method_id?: string
          raffle_id?: string
          seller_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
        }
        Relationships: [
          {
            foreignKeyName: "raffle_sales_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "public_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "public_raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          google_sheet_url: string | null
          id: string
          image_url: string | null
          internal_notes: string | null
          rules: string | null
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["raffle_status"]
          title: string
          total_points: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          google_sheet_url?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          rules?: string | null
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["raffle_status"]
          title: string
          total_points: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          google_sheet_url?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          rules?: string | null
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["raffle_status"]
          title?: string
          total_points?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact: string | null
          created_at: string
          document: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_payment_methods: {
        Row: {
          id: string | null
          name: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      public_raffle_points: {
        Row: {
          point_number: number | null
          raffle_id: string | null
          status: Database["public"]["Enums"]["point_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "raffle_points_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "public_raffles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_points_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_raffles: {
        Row: {
          created_at: string | null
          description: string | null
          ends_at: string | null
          google_sheet_url: string | null
          id: string | null
          image_url: string | null
          rules: string | null
          slug: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["raffle_status"] | null
          title: string | null
          total_points: number | null
          unit_price_cents: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          google_sheet_url?: string | null
          id?: string | null
          image_url?: string | null
          rules?: string | null
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["raffle_status"] | null
          title?: string | null
          total_points?: number | null
          unit_price_cents?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          google_sheet_url?: string | null
          id?: string | null
          image_url?: string | null
          rules?: string | null
          slug?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["raffle_status"] | null
          title?: string | null
          total_points?: number | null
          unit_price_cents?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_max_events: number
          p_window_seconds: number
        }
        Returns: undefined
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_vendedor_or_admin: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
        }
        Returns: undefined
      }
      rpc_cancel_raffle: {
        Args: { p_raffle_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancel_sale: {
        Args: {
          p_reason: string
          p_return_to_available?: boolean
          p_sale_id: string
        }
        Returns: undefined
      }
      rpc_close_raffle: { Args: { p_raffle_id: string }; Returns: undefined }
      rpc_confirm_sale: {
        Args: {
          p_attachment_id?: string
          p_buyer_full_name: string
          p_buyer_instagram: string
          p_buyer_notes: string
          p_buyer_phone: string
          p_buyer_whatsapp: string
          p_client_identifier?: string
          p_idempotency_key: string
          p_payment_method_id: string
          p_raffle_id: string
          p_reservation_token: string
        }
        Returns: Json
      }
      rpc_delete_financial_transaction: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_get_sale_receipt: { Args: { p_sale_id: string }; Returns: Json }
      rpc_release_expired_reservations: { Args: never; Returns: undefined }
      rpc_reserve_points: {
        Args: {
          p_client_identifier?: string
          p_point_numbers: number[]
          p_raffle_id: string
          p_reservation_token: string
          p_ttl_minutes?: number
        }
        Returns: {
          point_number: number
          reserved_until: string
        }[]
      }
      rpc_update_financial_transaction: {
        Args: {
          p_amount_cents: number
          p_category_id: string
          p_description: string
          p_id: string
          p_occurred_on: string
          p_reason: string
        }
        Returns: undefined
      }
    }
    Enums: {
      attachment_status: "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED"
      point_status: "AVAILABLE" | "RESERVED" | "SOLD" | "CANCELLED"
      raffle_status: "OPEN" | "CLOSED" | "CANCELLED"
      sale_status: "CONFIRMED" | "CANCELLED"
      transaction_type: "INCOME" | "EXPENSE"
      user_role: "ADMIN" | "VENDEDOR" | "VISUALIZADOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attachment_status: ["PENDING", "UPLOADING", "UPLOADED", "FAILED"],
      point_status: ["AVAILABLE", "RESERVED", "SOLD", "CANCELLED"],
      raffle_status: ["OPEN", "CLOSED", "CANCELLED"],
      sale_status: ["CONFIRMED", "CANCELLED"],
      transaction_type: ["INCOME", "EXPENSE"],
      user_role: ["ADMIN", "VENDEDOR", "VISUALIZADOR"],
    },
  },
} as const
