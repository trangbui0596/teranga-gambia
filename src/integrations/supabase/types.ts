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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      answer_audio: {
        Row: {
          answer_id: string
          audio_path: string
          lang: string
        }
        Insert: {
          answer_id: string
          audio_path: string
          lang: string
        }
        Update: {
          answer_id?: string
          audio_path?: string
          lang?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_audio_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          approved_at: string | null
          created_at: string
          dutch: string | null
          english: string | null
          flags: string[]
          german: string | null
          id: string
          is_sample: boolean
          recording_id: string
          review_status: Database["public"]["Enums"]["review_status"]
          roundtrip_score: number | null
          transcript_confidence: number | null
          transcript_src: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          dutch?: string | null
          english?: string | null
          flags?: string[]
          german?: string | null
          id?: string
          is_sample?: boolean
          recording_id: string
          review_status?: Database["public"]["Enums"]["review_status"]
          roundtrip_score?: number | null
          transcript_confidence?: number | null
          transcript_src?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          dutch?: string | null
          english?: string | null
          flags?: string[]
          german?: string | null
          id?: string
          is_sample?: boolean
          recording_id?: string
          review_status?: Database["public"]["Enums"]["review_status"]
          roundtrip_score?: number | null
          transcript_confidence?: number | null
          transcript_src?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_history: Json
          current_question_position: number | null
          current_review_answer_id: string | null
          lang: string
          last_visitor_question_id: string | null
          pending_action: Json | null
          phone_hash: string
          role: string
          state: string
          updated_at: string
        }
        Insert: {
          agent_history?: Json
          current_question_position?: number | null
          current_review_answer_id?: string | null
          lang?: string
          last_visitor_question_id?: string | null
          pending_action?: Json | null
          phone_hash: string
          role?: string
          state?: string
          updated_at?: string
        }
        Update: {
          agent_history?: Json
          current_question_position?: number | null
          current_review_answer_id?: string | null
          lang?: string
          last_visitor_question_id?: string | null
          pending_action?: Json | null
          phone_hash?: string
          role?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_current_review_answer_id_fkey"
            columns: ["current_review_answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_visitor_question_id_fkey"
            columns: ["last_visitor_question_id"]
            isOneToOne: false
            referencedRelation: "visitor_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_questions: {
        Row: {
          expected_topic: string
          id: string
          label: string
          text: string
        }
        Insert: {
          expected_topic: string
          id?: string
          label?: string
          text: string
        }
        Update: {
          expected_topic?: string
          id?: string
          label?: string
          text?: string
        }
        Relationships: []
      }
      outbound_daily: {
        Row: {
          day: string
          sent: number
        }
        Insert: {
          day: string
          sent?: number
        }
        Update: {
          day?: string
          sent?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          position: number
          text_en: string
          topic: string
        }
        Insert: {
          id?: string
          position: number
          text_en: string
          topic: string
        }
        Update: {
          id?: string
          position?: number
          text_en?: string
          topic?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          audio_path: string | null
          created_at: string
          id: string
          is_sample: boolean
          question_id: string
          status: string
          week: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          id?: string
          is_sample?: boolean
          question_id: string
          status?: string
          week: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          id?: string
          is_sample?: boolean
          question_id?: string
          status?: string
          week?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      unanswered: {
        Row: {
          added_to_round_week: string | null
          created_at: string
          id: string
          visitor_question_id: string
        }
        Insert: {
          added_to_round_week?: string | null
          created_at?: string
          id?: string
          visitor_question_id: string
        }
        Update: {
          added_to_round_week?: string | null
          created_at?: string
          id?: string
          visitor_question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_visitor_question_id_fkey"
            columns: ["visitor_question_id"]
            isOneToOne: false
            referencedRelation: "visitor_questions"
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_questions: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          is_sample: boolean
          lang: string
          matched_answer_id: string | null
          text: string
          was_clear: boolean | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_sample?: boolean
          lang: string
          matched_answer_id?: string | null
          text: string
          was_clear?: boolean | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_sample?: boolean
          lang?: string
          matched_answer_id?: string | null
          text?: string
          was_clear?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_questions_matched_answer_id_fkey"
            columns: ["matched_answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          answered: number
          call_sid: string
          created_at: string
          summary_sent: boolean
        }
        Insert: {
          answered?: number
          call_sid: string
          created_at?: string
          summary_sent?: boolean
        }
        Update: {
          answered?: number
          call_sid?: string
          created_at?: string
          summary_sent?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_outbound: { Args: { _max: number }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      voice_call_answered: { Args: { _sid: string }; Returns: number }
      voice_call_claim_summary: { Args: { _sid: string }; Returns: number }
    }
    Enums: {
      app_role: "champion"
      review_status: "pending" | "approved" | "rerecord" | "needs_bilingual"
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
    Enums: {
      app_role: ["champion"],
      review_status: ["pending", "approved", "rerecord", "needs_bilingual"],
    },
  },
} as const
