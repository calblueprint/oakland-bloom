export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      booking_event: {
        Row: {
          additional_contacts: string[];
          amenities: string[];
          amenity: string;
          approval_status: string;
          end_time: string;
          has_conflicts: string[];
          id: string;
          num_people: number;
          start_time: string;
          title: string;
          user: string;
        };
        ComputedFields: never;
        Insert: {
          additional_contacts?: string[];
          amenities: string[];
          amenity: string;
          approval_status: string;
          end_time: string;
          has_conflicts: string[];
          id: string;
          num_people: number;
          start_time: string;
          title: string;
          user: string;
        };
        Update: {
          additional_contacts?: string[];
          amenities?: string[];
          amenity?: string;
          approval_status?: string;
          end_time?: string;
          has_conflicts?: string[];
          id?: string;
          num_people?: number;
          start_time?: string;
          title?: string;
          user?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_event_user_fkey";
            columns: ["user"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
        ];
      };
      chef_facts: {
        Row: {
          chef_id: string;
          id: string;
          kind: string;
          source_message_id: string | null;
          updated_at: string;
          updated_by: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          chef_id: string;
          id?: string;
          kind: string;
          source_message_id?: string | null;
          updated_at?: string;
          updated_by: string;
          value: string;
        };
        Update: {
          chef_id?: string;
          id?: string;
          kind?: string;
          source_message_id?: string | null;
          updated_at?: string;
          updated_by?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chef_facts_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
        ];
      };
      chefs: {
        Row: {
          active: boolean;
          created_at: string;
          cuisines: string[];
          id: string;
          name: string;
          opt_in_method: string | null;
          opted_in_at: string | null;
          opted_out_at: string | null;
          preferred_language: string;
          user_id: string | null;
          wa_phone: string;
          whatsapp_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          cuisines?: string[];
          id?: string;
          name: string;
          opt_in_method?: string | null;
          opted_in_at?: string | null;
          opted_out_at?: string | null;
          preferred_language?: string;
          user_id?: string | null;
          wa_phone: string;
          whatsapp_user_id?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          cuisines?: string[];
          id?: string;
          name?: string;
          opt_in_method?: string | null;
          opted_in_at?: string | null;
          opted_out_at?: string | null;
          preferred_language?: string;
          user_id?: string | null;
          wa_phone?: string;
          whatsapp_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chefs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
          {
            foreignKeyName: "chefs_whatsapp_user_id_fkey";
            columns: ["whatsapp_user_id"];
            isOneToOne: true;
            referencedRelation: "whatsapp_user";
            referencedColumns: ["chef_id"];
          },
        ];
      };
      handoffs: {
        Row: {
          assigned_admin: string | null;
          chef_id: string;
          created_at: string;
          id: string;
          message_id: string;
          reason: string;
          resolved_at: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_admin?: string | null;
          chef_id: string;
          created_at?: string;
          id?: string;
          message_id: string;
          reason: string;
          resolved_at?: string | null;
          status?: string;
        };
        Update: {
          assigned_admin?: string | null;
          chef_id?: string;
          created_at?: string;
          id?: string;
          message_id?: string;
          reason?: string;
          resolved_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "handoffs_assigned_admin_fkey";
            columns: ["assigned_admin"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
          {
            foreignKeyName: "handoffs_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
        ];
      };
      interest_responses: {
        Row: {
          catering_id: string | null;
          chef_id: string;
          id: string;
          interested: boolean;
          message_id: string;
          opportunity_id: string | null;
          recorded_at: string;
        };
        ComputedFields: never;
        Insert: {
          catering_id?: string | null;
          chef_id: string;
          id?: string;
          interested: boolean;
          message_id: string;
          opportunity_id?: string | null;
          recorded_at?: string;
        };
        Update: {
          catering_id?: string | null;
          chef_id?: string;
          id?: string;
          interested?: boolean;
          message_id?: string;
          opportunity_id?: string | null;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interest_responses_catering_id_fkey";
            columns: ["catering_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_catering";
            referencedColumns: ["catering_id"];
          },
          {
            foreignKeyName: "interest_responses_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interest_responses_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunities: {
        Row: {
          created_at: string;
          created_by: string | null;
          details: string;
          headcount: number;
          id: string;
          location: string;
          pay_text: string | null;
          ref_code: string;
          starts_at: string;
          status: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          details?: string;
          headcount: number;
          id?: string;
          location: string;
          pay_text?: string | null;
          ref_code: string;
          starts_at: string;
          status?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          details?: string;
          headcount?: number;
          id?: string;
          location?: string;
          pay_text?: string | null;
          ref_code?: string;
          starts_at?: string;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
        ];
      };
      past_items: {
        Row: {
          chef_id: string;
          meal_id: string;
          name: string;
          price: number;
        };
        ComputedFields: never;
        Insert: {
          chef_id: string;
          meal_id: string;
          name: string;
          price: number;
        };
        Update: {
          chef_id?: string;
          meal_id?: string;
          name?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "past_items_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_user";
            referencedColumns: ["chef_id"];
          },
        ];
      };
      pending_confirmations: {
        Row: {
          catering_id: string | null;
          chef_id: string;
          expires_at: string;
          interested: boolean;
          opportunity_id: string | null;
          source_message_id: string;
        };
        ComputedFields: never;
        Insert: {
          catering_id?: string | null;
          chef_id: string;
          expires_at: string;
          interested: boolean;
          opportunity_id?: string | null;
          source_message_id: string;
        };
        Update: {
          catering_id?: string | null;
          chef_id?: string;
          expires_at?: string;
          interested?: boolean;
          opportunity_id?: string | null;
          source_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pending_confirmations_catering_id_fkey";
            columns: ["catering_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_catering";
            referencedColumns: ["catering_id"];
          },
          {
            foreignKeyName: "pending_confirmations_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: true;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_confirmations_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurants: {
        Row: {
          address: string | null;
          created_at: string;
          cuisine: string | null;
          id: string;
          name: string | null;
          userid: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          cuisine?: string | null;
          id?: string;
          name?: string | null;
          userid: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          cuisine?: string | null;
          id?: string;
          name?: string | null;
          userid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurants_userid_fkey";
            columns: ["userid"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
        ];
      };
      users: {
        Row: {
          email: string;
          is_admin: boolean;
          is_approved: boolean;
          name: string;
          phone: string;
          userid: string;
        };
        ComputedFields: never;
        Insert: {
          email: string;
          is_admin?: boolean;
          is_approved?: boolean;
          name: string;
          phone: string;
          userid: string;
        };
        Update: {
          email?: string;
          is_admin?: boolean;
          is_approved?: boolean;
          name?: string;
          phone?: string;
          userid?: string;
        };
        Relationships: [];
      };
      wa_conversations: {
        Row: {
          chef_id: string;
          human_takeover: boolean;
          last_inbound_at: string | null;
          lease_message_id: string | null;
          lease_owner: string | null;
          lease_until: string | null;
          summary: string;
        };
        ComputedFields: never;
        Insert: {
          chef_id: string;
          human_takeover?: boolean;
          last_inbound_at?: string | null;
          lease_message_id?: string | null;
          lease_owner?: string | null;
          lease_until?: string | null;
          summary?: string;
        };
        Update: {
          chef_id?: string;
          human_takeover?: boolean;
          last_inbound_at?: string | null;
          lease_message_id?: string | null;
          lease_owner?: string | null;
          lease_until?: string | null;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_conversations_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: true;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_conversations_lease_message_id_fkey";
            columns: ["lease_message_id"];
            isOneToOne: false;
            referencedRelation: "wa_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_deliveries: {
        Row: {
          attempts: number;
          chef_id: string;
          created_at: string;
          delivered_at: string | null;
          id: string;
          last_error: string | null;
          opportunity_id: string;
          provider_message_id: string | null;
          read_at: string | null;
          sent_at: string | null;
          status: string;
          template_language: string | null;
          template_name: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          chef_id: string;
          created_at?: string;
          delivered_at?: string | null;
          id?: string;
          last_error?: string | null;
          opportunity_id: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          status?: string;
          template_language?: string | null;
          template_name?: string | null;
        };
        Update: {
          attempts?: number;
          chef_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          id?: string;
          last_error?: string | null;
          opportunity_id?: string;
          provider_message_id?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          status?: string;
          template_language?: string | null;
          template_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wa_deliveries_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_deliveries_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_inbound_rejected: {
        Row: {
          handled_at: string | null;
          id: string;
          phone: string | null;
          provider: string;
          provider_message_id: string | null;
          reason: string;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          handled_at?: string | null;
          id?: string;
          phone?: string | null;
          provider: string;
          provider_message_id?: string | null;
          reason: string;
          received_at?: string;
        };
        Update: {
          handled_at?: string | null;
          id?: string;
          phone?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          reason?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      wa_media: {
        Row: {
          bytes: number | null;
          created_at: string;
          direction: string;
          id: string;
          kind: string;
          message_id: string;
          mime_type: string;
          provider_media_id: string;
          sha256: string | null;
          status: string;
          storage_path: string | null;
        };
        ComputedFields: never;
        Insert: {
          bytes?: number | null;
          created_at?: string;
          direction: string;
          id?: string;
          kind: string;
          message_id: string;
          mime_type: string;
          provider_media_id: string;
          sha256?: string | null;
          status?: string;
          storage_path?: string | null;
        };
        Update: {
          bytes?: number | null;
          created_at?: string;
          direction?: string;
          id?: string;
          kind?: string;
          message_id?: string;
          mime_type?: string;
          provider_media_id?: string;
          sha256?: string | null;
          status?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wa_media_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: true;
            referencedRelation: "wa_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_messages: {
        Row: {
          body: string;
          chef_id: string | null;
          context_message_id: string | null;
          direction: string;
          id: string;
          phone: string;
          processed_at: string | null;
          provider: string;
          provider_message_id: string | null;
          received_at: string;
          reply_to_message_id: string | null;
          send_owner: string | null;
          send_started_at: string | null;
          send_status: string | null;
          sent_at: string | null;
          sequence_no: number;
          tool_trace: Json | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          chef_id?: string | null;
          context_message_id?: string | null;
          direction: string;
          id?: string;
          phone: string;
          processed_at?: string | null;
          provider: string;
          provider_message_id?: string | null;
          received_at?: string;
          reply_to_message_id?: string | null;
          send_owner?: string | null;
          send_started_at?: string | null;
          send_status?: string | null;
          sent_at?: string | null;
          sequence_no?: never;
          tool_trace?: Json | null;
        };
        Update: {
          body?: string;
          chef_id?: string | null;
          context_message_id?: string | null;
          direction?: string;
          id?: string;
          phone?: string;
          processed_at?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          received_at?: string;
          reply_to_message_id?: string | null;
          send_owner?: string | null;
          send_started_at?: string | null;
          send_status?: string | null;
          sent_at?: string | null;
          sequence_no?: never;
          tool_trace?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "wa_messages_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wa_messages_reply_to_message_id_fkey";
            columns: ["reply_to_message_id"];
            isOneToOne: true;
            referencedRelation: "wa_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_catering: {
        Row: {
          catering_id: string;
          chef: string;
          day_created: string;
          details: string;
          event_at: string | null;
          is_accepted: boolean;
          location: string | null;
          meal_name: string;
          num_people: number;
          ref_code: string;
          request_status: string;
          response_at: string | null;
          response_message_id: string | null;
          response_status: string;
        };
        ComputedFields: never;
        Insert: {
          catering_id: string;
          chef: string;
          day_created: string;
          details?: string;
          event_at?: string | null;
          is_accepted: boolean;
          location?: string | null;
          meal_name: string;
          num_people: number;
          ref_code?: string;
          request_status?: string;
          response_at?: string | null;
          response_message_id?: string | null;
          response_status?: string;
        };
        Update: {
          catering_id?: string;
          chef?: string;
          day_created?: string;
          details?: string;
          event_at?: string | null;
          is_accepted?: boolean;
          location?: string | null;
          meal_name?: string;
          num_people?: number;
          ref_code?: string;
          request_status?: string;
          response_at?: string | null;
          response_message_id?: string | null;
          response_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_catering_chef_fkey";
            columns: ["chef"];
            isOneToOne: false;
            referencedRelation: "whatsapp_user";
            referencedColumns: ["chef_id"];
          },
        ];
      };
      whatsapp_user: {
        Row: {
          chef_id: string;
          name: string;
          phone: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          chef_id: string;
          name: string;
          phone: string;
          user_id?: string | null;
        };
        Update: {
          chef_id?: string;
          name?: string;
          phone?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_user_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["userid"];
          },
        ];
      };
    };
    Views: {
      latest_interest: {
        Row: {
          chef_id: string | null;
          interested: boolean | null;
          message_id: string | null;
          opportunity_id: string | null;
          recorded_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "interest_responses_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "chefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interest_responses_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      claim_wa_reply: {
        Args: { target_phone: string; worker_id: string };
        Returns: Json;
      };
      claim_wa_turn: {
        Args: { target_phone: string; worker_id: string };
        Returns: Json;
      };
      commit_wa_turn: {
        Args: { inbound_id: string; turn_state: Json; worker_id: string };
        Returns: string;
      };
      create_booking_request: {
        Args: {
          p_additional_contacts: string[];
          p_amenities: string[];
          p_end: string;
          p_id: string;
          p_num_people: number;
          p_start: string;
          p_title: string;
        };
        Returns: string;
      };
      get_wa_staff_queue: {
        Args: { actor_id: string };
        Returns: Json;
      };
      get_wa_staff_conversation: {
        Args: { actor_id: string; chef_id: string };
        Returns: Json;
      };
      set_wa_staff_takeover: {
        Args: { actor_id: string; chef_id: string; takeover: boolean };
        Returns: Json;
      };
      resolve_wa_handoff: {
        Args: { actor_id: string; handoff_id: string };
        Returns: Json;
      };
      queue_wa_staff_reply: {
        Args: {
          actor_id: string;
          chef_id: string;
          body: string;
          request_id: string;
        };
        Returns: Json;
      };
      set_wa_alert_consent: {
        Args: {
          actor_id: string;
          chef_id: string;
          opted_in: boolean;
          evidence: string;
        };
        Returns: Json;
      };
      list_wa_kitchen_bookings: {
        Args: { target_phone: string; worker_id: string; inbound_id: string };
        Returns: Json;
      };
      check_wa_kitchen_availability: {
        Args: {
          target_phone: string;
          worker_id: string;
          inbound_id: string;
          amenity: string;
          start_at: string;
          end_at: string;
        };
        Returns: Json;
      };
      claim_wa_notification: {
        Args: {
          target_phone: string;
          worker_id: string;
          template_name?: string | null;
          template_language?: string | null;
        };
        Returns: Json;
      };
      finish_wa_notification: {
        Args: {
          notification_id: string;
          worker_id: string;
          provider_id: string;
        };
        Returns: undefined;
      };
      fail_wa_notification: {
        Args: { notification_id: string; worker_id: string };
        Returns: undefined;
      };
      email_exists: {
        Args: { p_client_key: string; p_email: string };
        Returns: boolean;
      };
      fail_wa_reply: {
        Args: { outbound_id: string; worker_id: string };
        Returns: undefined;
      };
      finish_wa_reply: {
        Args: { outbound_id: string; provider_id: string; worker_id: string };
        Returns: undefined;
      };
      get_calendar_occupied_periods: {
        Args: { p_end: string; p_start: string };
        Returns: {
          amenity: string;
          end_time: string;
          start_time: string;
        }[];
      };
      ingest_inbound: { Args: { batch: Json }; Returns: undefined };
      release_wa_turn: {
        Args: { chef_id: string; worker_id: string };
        Returns: undefined;
      };
      resolve_wa_chef: { Args: { sender_phone: string }; Returns: string };
      wa_normalize_phone: { Args: { value: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
