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
          amenity: string;
          approval_status: string;
          end_time: string;
          has_conflicts: string[];
          id: string;
          num_people: number;
          start_time: string;
          user: string;
        };
        ComputedFields: never;
        Insert: {
          amenity: string;
          approval_status: string;
          end_time: string;
          has_conflicts: string[];
          id: string;
          num_people: number;
          start_time: string;
          user: string;
        };
        Update: {
          amenity?: string;
          approval_status?: string;
          end_time?: string;
          has_conflicts?: string[];
          id?: string;
          num_people?: number;
          start_time?: string;
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
      whatsapp_catering: {
        Row: {
          catering_id: string;
          chef: string;
          day_created: string;
          is_accepted: boolean;
          meal_name: string;
          num_people: number;
        };
        ComputedFields: never;
        Insert: {
          catering_id: string;
          chef: string;
          day_created: string;
          is_accepted: boolean;
          meal_name: string;
          num_people: number;
        };
        Update: {
          catering_id?: string;
          chef?: string;
          day_created?: string;
          is_accepted?: boolean;
          meal_name?: string;
          num_people?: number;
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
        };
        ComputedFields: never;
        Insert: {
          chef_id: string;
          name: string;
          phone: string;
        };
        Update: {
          chef_id?: string;
          name?: string;
          phone?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      email_exists: {
        Args: { p_email: string };
        Returns: boolean;
      };
      get_calendar_occupied_periods: {
        Args: { p_end: string; p_start: string };
        Returns: {
          amenity: string;
          end_time: string;
          start_time: string;
        }[];
      };
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
